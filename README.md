# DebtBook

Offline-first **customer credit ledger** (book debt / udhar) for African shopkeepers.  
**Nigeria · English · ₦ Naira** · Vite + Preact + IndexedDB + PWA.

Live: https://debtbook-neon.vercel.app

## Quick start

```bash
cd debtbook
npm install
npm run dev      # http://localhost:5173
npm run build
npm test
```

## Free vs Pro

| | Free | Pro |
|---|------|-----|
| Offline ledger (customers, credit sales, payments) | ✓ | ✓ |
| WhatsApp-first remind (+ SMS / share fallback) | ✓ | ✓ |
| Plain-text statement | ✓ | ✓ |
| Local JSON backup (export / import) | ✓ | ✓ |
| Optional PIN lock | ✓ | ✓ |
| Due-date overdue badges | ✓ | ✓ |
| CSV export (customers + balances + entries) | | ✓ |
| Encrypted cloud backup + multi-device restore | | ✓ |
| Pro badge / hide upgrade nag | | ✓ |

**Pricing:** ₦1,500/mo or ₦12,000/yr.

**Try Pro tonight:** Settings → **DebtBook Pro** → **Activate Pro (demo)** — sets `plan=pro` for 30 days locally (no Paystack/Stripe keys needed).

**Cloud backup (Pro):** `api/cloud-backup.ts` stores encrypted blobs via [Vercel Blob](https://vercel.com/docs/storage/vercel-blob). Create a Blob store in the Vercel project and set `BLOB_READ_WRITE_TOKEN`. Without it the API returns 501. Recovery code never leaves the device as plaintext; server only sees opaque `backupId` + ciphertext.\n\n**Real payments (stub):** `api/checkout.ts` + `api/webhook.ts` document Paystack (preferred for NGN) and Stripe. They return 501 until `PAYSTACK_SECRET_KEY` / `STRIPE_SECRET_KEY` are set on Vercel — and still need a short wiring pass after that.

## Features (v2)

1. **Shop profile** — IndexedDB  
2. **Customers** — add / edit / search; optional phone, note, **due date**  
3. **Entries** — credit sale / payment; amount chips (₦500, 1k, 2k, 5k, 10k); market parse `3k` / `1.5k`  
4. **Balances** — home: **overdue first**, then highest debt; total outstanding  
5. **Quick actions** — Credit / Payment from the home list  
6. **Undo** — toast Undo (~10s) after save; or “Undo last” on customer detail (10 min)  
7. **Remind** — WhatsApp `wa.me` first (NG `0…` → `234…`), else SMS, else share/clipboard  
8. **Statement** — share / copy  
9. **PIN lock** — optional 4-digit; SHA-256(salt+pin); lock on tab return; hide totals when locked  
10. **Local backup** — Settings Export / Import JSON  
11. **Motion** — CSS-only press + enter animations; respects `prefers-reduced-motion`  
12. **PWA** — installable, offline shell  

## Balance math

```
customer balance = sum(credit sales) − sum(payments)
```

Amounts stored as **integer kobo** (1 ₦ = 100 kobo). Negative balances allowed (shop owes customer).

## Architecture

```
src/
  db/          IndexedDB schema (idb v2), repository, outbox
  lib/         money, sms, statement, pin, entitlement, backup, csv, router
  pages/       Setup, Home, Customer, Entry, Settings, Pro
  components/  Status badge, toast (+ Undo), money input (+ chips), PIN lock
  styles/      Mobile-first CSS + motion
api/           Vercel serverless stubs (checkout / webhook)
```

- **Routing:** hash (`#/customers/:id`, `#/settings/pro`)  
- **DB version 2:** optional `dueAt` on customers; `pinHash` / `pinSalt` / `entitlement` on shop  

## Paystack note (Nigeria)

Prefer **Paystack** for NGN subscriptions. Stripe is optional. Never put secret keys in the PWA — only in Vercel env for `/api/*`. Until keys exist, **Activate Pro (demo)** is the supported path.

## License

MIT
