declare const process: { env: Record<string, string | undefined> };

/**
 * Encrypted cloud backup store (Vercel serverless).
 *
 * POST — store ciphertext blob keyed by opaque backupId
 * GET  ?id= — retrieve ciphertext + iv + salt + meta + storedAt
 * GET  ?id=&meta=1 — meta + storedAt only (no ciphertext)
 *
 * Never stores recovery code or plaintext ledger.
 * Requires process.env.BLOB_READ_WRITE_TOKEN (@vercel/blob); else 501.
 */

type Req = {
  method?: string;
  query?: { id?: string | string[]; meta?: string | string[] };
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

function queryMetaOnly(req: Req): boolean {
  const raw = req.query?.meta;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === '1' || v === 'true';
}

function isHexId(id: string): boolean {
  return /^[a-f0-9]{64}$/i.test(id);
}

type Access = 'private' | 'public';

/** Private stores (Vercel's current default) and older public stores both work. */
function accessOrder(): Access[] {
  return process.env.BLOB_ACCESS === 'public' ? ['public', 'private'] : ['private', 'public'];
}

function isAccessMismatch(err: unknown): boolean {
  return err instanceof Error && /(private|public) access on a (public|private) store/i.test(err.message);
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
      let lastErr: unknown;
      for (const access of accessOrder()) {
        try {
          await put(blobPath(backupId), JSON.stringify(payload), {
            access,
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: 'application/json',
            token,
          });
          res.status(200).json({ ok: true, backupId: payload.backupId });
          return;
        } catch (err) {
          lastErr = err;
          if (!isAccessMismatch(err)) break;
        }
      }
      throw lastErr;
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
      const { get } = await import('@vercel/blob');
      const pathname = blobPath(id);
      let text: string | null = null;
      let lastErr: unknown;
      let found = false;
      for (const access of accessOrder()) {
        try {
          const hit = await get(pathname, { access, token, useCache: false });
          if (hit && hit.statusCode === 200 && hit.stream) {
            text = await new Response(hit.stream).text();
            found = true;
          }
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          if (/not ?found/i.test(err instanceof Error ? err.message : '')) {
            lastErr = undefined;
            break;
          }
          if (!isAccessMismatch(err)) break;
        }
      }
      if (lastErr) throw lastErr;
      if (!found || text == null) {
        res.status(404).json({
          ok: false,
          message: 'No cloud backup found for this recovery code',
        });
        return;
      }

      const data = JSON.parse(text) as {
        backupId?: string;
        ciphertext?: string;
        iv?: string;
        salt?: string;
        meta?: unknown;
        storedAt?: number;
      };

      if (queryMetaOnly(req)) {
        res.status(200).json({
          ok: true,
          backupId: data.backupId || id.toLowerCase(),
          storedAt: data.storedAt ?? null,
          meta: data.meta ?? null,
        });
        return;
      }

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
        storedAt: data.storedAt ?? null,
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
