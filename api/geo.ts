/**
 * GET /api/geo → { country: "NG" } (ISO 3166-1 alpha-2 from Vercel's edge header) or { country: null }.
 *
 * Used only to pick region wording ("Nigerian shops" vs "small shops") and a default currency.
 * Stores nothing and logs nothing: no IP, no cookies, no analytics. The client caches the answer
 * on the phone so it works offline.
 */
type Req = { method?: string; headers?: Record<string, string | string[] | undefined> };
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader?: (k: string, v: string) => void;
};

export function countryFromHeaders(headers: Req['headers'] = {}): string | null {
  const raw = headers['x-vercel-ip-country'];
  const v = (Array.isArray(raw) ? raw[0] : raw || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

export default function handler(req: Req, res: Res): void {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('Vary', 'x-vercel-ip-country');
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader?.('Allow', 'GET, HEAD');
    res.status(405).json({ country: null });
    return;
  }
  res.status(200).json({ country: countryFromHeaders(req.headers) });
}
