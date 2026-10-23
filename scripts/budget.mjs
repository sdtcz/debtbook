// Bundle budget: runs after `vite build` (npm run build, so every Vercel deploy) and FAILS the
// build when the app gets heavier. Users are on 2G/3G with costly data — raise a number only on
// purpose, in the same commit as the reason.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = {
  startupJs: 42, // app.js + chunks the HTML modulepreloads (was 50.3 kB as one file, Oct 2026)
  entryJs: 24, // app.js alone: re-sent on every deploy
  css: 18,
  firstVisit: 80, // HTML + startup JS + CSS + Setup screen chunk (what a new phone needs to start)
  precache: 140, // everything the service worker downloads on install
};

const dist = new URL('../dist/', import.meta.url).pathname;
const gz = (rel) => gzipSync(readFileSync(join(dist, rel)), { level: 9 }).length / 1024;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const refs = (re) => [...html.matchAll(re)].map((m) => m[1].replace(/^\//, ''));
const entry = refs(/<script[^>]+src="([^"]+\.js)"/g);
const preloads = refs(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g);
const css = refs(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g);
const setup = readdirSync(join(dist, 'assets')).filter((f) => /^SetupPage-.*\.js$/.test(f)).map((f) => `assets/${f}`);
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const precached = [...new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]))].filter((u) => statSync(join(dist, u), { throwIfNoEntry: false }));

const sum = (files) => files.reduce((a, f) => a + gz(f), 0);
const actual = {
  startupJs: sum([...entry, ...preloads]),
  entryJs: sum(entry),
  css: sum(css),
  firstVisit: sum(['index.html', ...entry, ...preloads, ...css, ...setup]),
  precache: sum(precached),
};

let failed = false;
for (const [k, max] of Object.entries(BUDGET_KB)) {
  const v = actual[k];
  const ok = v <= max;
  if (!ok) failed = true;
  console.log(`${ok ? '✓' : '✗'} ${k.padEnd(11)} ${v.toFixed(2).padStart(7)} kB gzip  (budget ${max} kB)`);
}
if (failed) {
  console.error('\nBundle budget exceeded (scripts/budget.mjs). Make it lighter or raise the budget on purpose.');
  process.exit(1);
}
