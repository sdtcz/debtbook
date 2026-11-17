declare const process: { env: Record<string, string | undefined> };

/**
 * Daily retention job for encrypted cloud backups (Vercel Cron, see vercel.json).
 *
 * Deletes backups under `debtbook-backups/` whose last upload is more than
 * RETENTION_DAYS (90) old. Pro phones re-upload on every sync, so only backups
 * that have not synced for 90 days are removed.
 *
 * Safety:
 *  - Auth: Authorization: Bearer <CRON_SECRET> (Vercel Cron sends this). No CRON_SECRET → 501, nothing runs.
 *  - Lists ONLY the backup folder and re-checks every pathname against the exact
 *    backup shape, so usage counts (debtbook-stats/) and anything else are never touched.
 *  - At most MAX_DELETES_PER_RUN deletions per run.
 *  - ?dry=1 reports what would be deleted and deletes nothing.
 *  - Responds with counts only — never backup ids, contents or the secret.
 */

type Req = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader?: (k: string, v: string) => void;
};

export const RETENTION_DAYS = 90;
export const MAX_DELETES_PER_RUN = 50;
export const BACKUP_PREFIX = 'debtbook-backups/';
const DAY_MS = 24 * 60 * 60 * 1000;
const BACKUP_PATH_RE = /^debtbook-backups\/[a-f0-9]{64}\.json$/;

export type ListedBlob = { pathname: string; url: string; uploadedAt: Date | string | number };

/** True only for objects that are cloud backups (exact folder + id shape). */
export function isBackupPath(pathname: string): boolean {
  return BACKUP_PATH_RE.test(pathname);
}

/** Backups whose last upload is strictly older than RETENTION_DAYS before `now`. */
export function selectExpired(blobs: ListedBlob[], now = Date.now(), days = RETENTION_DAYS): ListedBlob[] {
  const cutoff = now - days * DAY_MS;
  return blobs.filter((b) => {
    if (!isBackupPath(b.pathname)) return false;
    const t = new Date(b.uploadedAt).getTime();
    return Number.isFinite(t) && t < cutoff;
  });
}

function header(req: Req, name: string): string {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v[0] || '' : v || '';
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function isDry(req: Req): boolean {
  const raw = req.query?.dry;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === '1' || v === 'true';
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader?.('Cache-Control', 'no-store');

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(501).json({ ok: false, message: 'Retention job not configured (CRON_SECRET unset)' });
    return;
  }
  const auth = header(req, 'authorization');
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m || !safeEqual(m[1], secret)) {
    res.status(401).json({ ok: false, message: 'Unauthorized' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(501).json({ ok: false, message: 'Blob store not configured' });
    return;
  }

  const dryRun = isDry(req);
  const now = Date.now();
  try {
    const { list, del } = await import('@vercel/blob');
    const all: ListedBlob[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await list({ prefix: BACKUP_PREFIX, token, cursor, limit: 1000 });
      for (const b of page.blobs) all.push({ pathname: b.pathname, url: b.url, uploadedAt: b.uploadedAt });
      cursor = page.hasMore ? page.cursor : undefined;
      pages++;
    } while (cursor && pages < 20);

    const scanned = all.filter((b) => isBackupPath(b.pathname)).length;
    const expired = selectExpired(all, now);
    const batch = expired.slice(0, MAX_DELETES_PER_RUN);
    if (!dryRun && batch.length) {
      await del(batch.map((b) => b.url), { token });
    }
    res.status(200).json({
      ok: true,
      dryRun,
      retentionDays: RETENTION_DAYS,
      scanned,
      expired: expired.length,
      [dryRun ? 'wouldDelete' : 'deleted']: batch.length,
      capped: expired.length > batch.length,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : 'Retention job failed',
    });
  }
}
