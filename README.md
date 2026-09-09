# DebtBook

Offline-first **customer credit ledger** (book debt / udhar) for African shopkeepers.  
MVP: **Nigeria · English · ₦ Naira**.

Built for a provision-store owner on a cheap Android phone: large tap targets, system fonts, works with DevTools Offline, installable as a PWA.

## Quick start

```bash
cd debtbook
npm install
npm run dev      # http://localhost:5173
npm run build    # production → dist/
npm run preview  # serve dist/
npm test         # unit tests (money + balance math)
```

## Scripts

| Script | Purpose |
|--------|---------|
| `dev` | Vite dev server (PWA plugin enabled in dev) |
| `build` | Typecheck + production build to `dist/` |
| `preview` | Preview the production build |
| `test` | Vitest (balance & money helpers) |

## Features

1. **Shop profile** — name stored in IndexedDB  
2. **Customers** — add / edit / list / search (name required; optional phone + note)  
3. **Entries** — credit sale (↑ debt) and payment (↓ debt); amount, optional note, timestamp  
4. **Balances** — running balance per customer; home sorted by highest debt + total outstanding  
5. **Offline-first** — IndexedDB is source of truth; offline / pending-sync badge  
6. **Sync outbox stub** — queued mutations with ids, timestamps, LWW-ready payloads (no backend yet)  
7. **Remind** — `sms:` link with prefilled body + Web Share / clipboard fallback (`src/lib/sms.ts` notes Africa’s Talking)  
8. **Statement** — plain-text statement share / copy  
9. **Mobile-first UI** — ₦ formatting with thousands separators  
10. **Installable PWA** — manifest + icons + service worker (vite-plugin-pwa)

## Balance math

```
customer balance = sum(credit sales) − sum(payments)
```

Amounts are stored as **integer kobo** (1 ₦ = 100 kobo) to avoid float errors.

**Negative balances are allowed** (overpay = shop owes customer) and shown clearly as “you owe”.

Total outstanding on the home screen sums **positive** balances only (what customers still owe the shop).

## Architecture

```
src/
  db/          IndexedDB schema (idb), repository, sync outbox
  lib/         money, sms, statement, router, types, ids
  pages/       Setup, Home, Customer, Entry, Settings
  components/  Status badge, toast, money input
  styles/      Mobile-first CSS (system fonts)
```

- **Routing:** hash-based (`#/customers/:id`) — works offline from `index.html`  
- **Persistence:** `idb` stores `shop`, `customers`, `entries`, `outbox`  
- **Mutations:** every write also enqueues an outbox item (`pending` → stub `synced`)  
- **PWA:** `vite-plugin-pwa` + Workbox precache; `registerType: 'autoUpdate'`

## PWA / install

1. `npm run build && npm run preview` (or deploy `dist/` to any static host over **HTTPS**)  
2. On Android Chrome: menu → **Install app** / **Add to Home screen**  
3. DevTools → Application → Service Workers / Manifest to verify  
4. DevTools → Network → **Offline** — app should still open and read/write IndexedDB  

> Note: `vite preview` / localhost works for install testing; production needs HTTPS (or localhost).

## 2G / low-end notes

- Bundle is intentionally small (Preact + idb, no UI kit)  
- System fonts only — no webfont download  
- Precached shell means first successful visit → later opens without network  
- Prefer Wi‑Fi for the first install; afterward bookkeeping works offline  
- Avoid large photos/inventory (out of scope) — keep the ledger lean for storage-constrained phones  

## Africa’s Talking (next step)

SMS reminders currently open the device SMS app. For programmatic SMS (bulk / no handset):

1. Add a small backend that holds Africa’s Talking credentials (never in the PWA)  
2. Implement `SmsProvider` described in `src/lib/sms.ts`  
3. Queue “remind” jobs in the outbox when offline; flush when online  
4. Reuse `buildRemindMessage()` so copy stays consistent  

## Out of scope (MVP)

Inventory, tax, lending, auth, payment APIs, WhatsApp Business API, analytics, photos.

## License

MIT — built as a greenfield demo / starter for shopkeeper credit ledgers.
