declare const process: { env: Record<string, string | undefined> };

/**
 * Encrypted cloud backup store (Vercel serverless).
 *
 * POST — store ciphertext blob keyed by opaque backupId
 * GET  ?id= — retrieve ciphertext + iv + salt + meta
 *
 * Never stores recovery code or plaintext ledger.
 * Requires process.env.BLOB_READ_WRITE_TOKEN (@vercel/blob); else 501.
 */

type Req = {
  method?: string;
  query?: { id?: string | string[] };
  body?: {
    backupId?: string;
    ciphertext?: string;
    iv?: string;
    salt?: string;
    meta?: unknown;
  };
};

type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
};

const PATH_PREFIX = 'debtbook-backups'; // KEEP: blob path prefix for existing cloud backups

function queryId(req: Req): string | undefined {
  const raw = req.query?.id;
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function isHexId(id: string): boolean {
  return /^[a-f0-9]{64}$/i.test(id);
}

function blobPath(backupId: string): string {
  return `${PATH_PREFIX}/${backupId.toLowerCase()}.json`;
}

export default async function handler(req: Req, res: Res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(501).json({
      ok: false,
      message:
        'Cloud backup not configured. Set BLOB_READ_WRITE_TOKEN (Vercel Blob store) on the server.',
    });
    return;
  }

  if (req.method === 'POST') {
    const backupId = req.body?.backupId?.trim();
    const ciphertext = req.body?.ciphertext;
    const iv = req.body?.iv;
    const salt = req.body?.salt;
    const meta = req.body?.meta;

    if (!backupId || !isHexId(backupId)) {
      res.status(400).json({ ok: false, message: 'Invalid backupId' });
      return;
    }
    if (
      typeof ciphertext !== 'string' ||
      typeof iv !== 'string' ||
      typeof salt !== 'string' ||
      !ciphertext ||
      !iv ||
      !salt
    ) {
      res.status(400).json({
        ok: false,
        message: 'ciphertext, iv, and salt are required',
      });
      return;
    }

    // Soft size guard (~2MB JSON) — ledger backups are small
    if (ciphertext.length > 2_000_000) {
      res.status(413).json({ ok: false, message: 'Backup too large' });
      return;
    }

    const payload = {
      backupId: backupId.toLowerCase(),
      ciphertext,
      iv,
      salt,
      meta: meta ?? null,
      storedAt: Date.now(),
    };

    try {
      const { put } = await import('@vercel/blob');
      await put(blobPath(backupId), JSON.stringify(payload), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        token,
      });
      res.status(200).json({ ok: true, backupId: payload.backupId });
    } catch (err) {
      res.status(500).json({
        ok: false,
        message:
          err instanceof Error ? err.message : 'Failed to store cloud backup',
      });
    }
    return;
  }

  if (req.method === 'GET') {
    const id = queryId(req)?.trim();
    if (!id || !isHexId(id)) {
      res.status(400).json({ ok: false, message: 'Valid id query param required' });
      return;
    }

    try {
      const { list } = await import('@vercel/blob');
      const pathname = blobPath(id);
      const { blobs } = await list({ prefix: pathname, limit: 10, token });
      const hit = blobs.find((b) => b.pathname === pathname) || blobs[0];
      if (!hit) {
        res.status(404).json({
          ok: false,
          message: 'No cloud backup found for this recovery code',
        });
        return;
      }

      const fetched = await fetch(hit.url);
      if (!fetched.ok) {
        res.status(502).json({
          ok: false,
          message: 'Failed to read stored backup blob',
        });
        return;
      }

      const data = (await fetched.json()) as {
        backupId?: string;
        ciphertext?: string;
        iv?: string;
        salt?: string;
        meta?: unknown;
      };

      if (!data.ciphertext || !data.iv || !data.salt) {
        res.status(500).json({ ok: false, message: 'Corrupt backup blob' });
        return;
      }

      res.status(200).json({
        ok: true,
        backupId: data.backupId || id.toLowerCase(),
        ciphertext: data.ciphertext,
        iv: data.iv,
        salt: data.salt,
        meta: data.meta ?? null,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        message:
          err instanceof Error ? err.message : 'Failed to retrieve cloud backup',
      });
    }
    return;
  }

  res.status(405).json({ ok: false, message: 'Method not allowed' });
}
