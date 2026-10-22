/**
 * Builds the Content-Security-Policy in vercel.json.
 * The static SEO pages keep their small inline scripts (one request on 2G), so
 * their sha256 hashes are allowed explicitly. Run after editing any public/*.html script:
 *   node scripts/csp.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}

export function inlineScriptHashes(root = '.') {
  const out = new Set();
  for (const f of htmlFiles(join(root, 'public'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      out.add(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
    }
  }
  return [...out].sort();
}

export function buildCsp(hashes) {
  return [
    "default-src 'self'",
    ["script-src 'self'", ...hashes].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.stripe.com",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com",
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://billing.stripe.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    "frame-ancestors 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = 'vercel.json';
  const v = JSON.parse(readFileSync(path, 'utf8'));
  const all = v.headers.find((h) => h.source === '/(.*)');
  const csp = all.headers.find((h) => h.key === 'Content-Security-Policy');
  csp.value = buildCsp(inlineScriptHashes());
  writeFileSync(path, JSON.stringify(v, null, 2) + '\n');
  console.log('CSP updated');
}
