# Legal drafts (NOT PUBLISHED)

These are working drafts for Stephen to review with a qualified lawyer. They are
**not** legal advice, are **not** linked from the app, and must not be published
until reviewed and the placeholders in `[square brackets]` are filled in.

| File | What it is |
| --- | --- |
| `terms.md` | Terms of Use for the free app and BashiBook Pro |
| `refund-policy.md` | Subscription, cancellation and refund policy |
| `privacy-nigeria-ndpa.md` | Privacy notice written for the Nigeria Data Protection Act 2023 (NDPA) |
| `privacy-generic.md` | Privacy notice for users outside Nigeria (GDPR-style baseline) |

Facts these drafts rely on (check they are still true before publishing):

- The ledger (shop, customers, entries, suppliers, payment details) is stored in the browser on the user's phone (IndexedDB). There is no account or login server.
- Free backup is a JSON file the user downloads and keeps.
- Pro cloud backup is encrypted on the phone (AES-GCM, key derived from the user's recovery code with PBKDF2). The server stores only ciphertext under an opaque id. The recovery code is never sent or stored by us.
- Payments are handled by Stripe Checkout. We receive the email address entered for the receipt, the plan and payment status. Card details go only to Stripe.
- Customers manage or cancel at the Stripe customer portal (link in the app's Pro page and Settings).
- `/api/hit` records anonymous counts of an event name and a channel tag (`src`). The IP address is used in memory only, as a salted hash, for rate limiting and is not stored or logged.
- `/api/geo` returns the visitor's country code from the hosting provider's header so the app can choose region wording and default currency. It stores and logs nothing. The app caches the result on the phone.
- Reminders, receipts and Pay-me links open WhatsApp or SMS on the user's phone. BashiBook does not send messages.
- Hosting: Vercel (USA). Storage for cloud backups: Vercel Blob.
- Prices: Pro $1.99/month or $15/year (USD), 5-day free trial once per phone, no card needed for the trial.
