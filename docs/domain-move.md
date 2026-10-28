# Domain move: debtbook-neon.vercel.app → bashibook.app (Oct 2026)

## Hosts
- `bashibook.app` is the production domain and canonical everywhere.
- `www.bashibook.app` 308-redirects to the apex (Vercel domain setting).
- `debtbook-neon.vercel.app` (old address), set by a host-based rule in `vercel.json`:
  - Every page 308-redirects to the same path on bashibook.app, and query strings are kept.
  - These are NOT redirected: `/` and `/index.html` (the app shell), `/assets/*`, `/app.js`,
    `/sw.js`, `/workbox-*`, the manifest and icons, and **`/api/*`**. That keeps the Stripe webhook
    and API calls answering, and lets installed copies update.
- Preview URLs (`debtbook-*-s-dz-8.vercel.app`) are untouched.

## Why the app shell is not hard-redirected
A phone's book lives in IndexedDB, which belongs to one origin (address). A hard redirect would
make an existing book look gone. So on the old address (`src/main.tsx` → `src/lib/moveOld.tsx`):
- **No book on this phone, or already moved:** go to the same path, query and hash on
  bashibook.app. This also forwards Stripe's checkout return (`?session_id=…`).
- **A book on this phone:** the app opens as before with a "Move your book to bashibook.app" card.
  - Moving opens `bashibook.app/?app=1#/move-in` in a new tab, asks the PIN (if one is set), and
    hands the backup over with `window.postMessage`.
  - Messages only go between the two exact origins and the two windows; nothing goes through a
    server or a URL.
  - The new tab imports the book. It asks first if bashibook.app already holds a book, because an
    import replaces it.
  - The old copy is never deleted. After a successful move the old address redirects.
- **Fallback** (popup blocked, installed-app quirks): download the backup file, then use
  Settings → Restore backup on bashibook.app. Pro users can also restore from cloud with their
  recovery code.

## Stripe
- Checkout `success_url` and `cancel_url` come from the request host in `api/checkout.ts`
  (`callbackOrigin`), not from env vars.
  - Only `*.vercel.app` hosts are allowed, with `https://debtbook-neon.vercel.app` as the default.
  - So a checkout started on bashibook.app returns to the old address. That old page forwards the
    `?session_id=` to bashibook.app (above), where `/api/verify` confirms it.
  - Owner change still to make in `api/checkout.ts`: allow `bashibook.app` and make it the default.
- Webhook endpoint `we_1USUNAJySIXO9ypIdu6Af4MZ` posts to `https://debtbook-neon.vercel.app/api/webhook`.
  This still works because `/api` is not redirected. Switch it in the Stripe Dashboard to
  `https://bashibook.app/api/webhook`; the signing secret stays the same.
- Customer portal (`bpc_1SYwmBJySIXO9ypI73KqQYNK`, shared with InvoiceForge) has no default
  return URL; the app links to the portal login page. Nothing to change.
