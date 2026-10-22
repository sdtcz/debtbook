# BashiBook Privacy Notice (Nigeria) — DRAFT

> DRAFT for legal review against the Nigeria Data Protection Act 2023 (NDPA) and the NDPC's General Application and Implementation Directive. Not published. Not legal advice.

Last updated: [date]

## 1. Data controller
[Operator legal name], [address]. Contact for privacy questions and requests: [privacy email]. [Data Protection Officer: name/contact, if required.] [NDPC registration as a data controller/processor of major importance: number, if required.]

## 2. The short version
- Your shop book stays **on your phone**. We do not have a copy unless you turn on Pro cloud backup, and even then it is encrypted on your phone with a recovery code that only you have.
- We do not sell personal data and we do not run ads.

## 3. What we process, why, and our lawful basis (NDPA s.25)

| Data | Where it is | Purpose | Lawful basis |
| --- | --- | --- | --- |
| Shop name, customers' and suppliers' names, phone numbers, amounts, notes, your bank details for Pay-me | On your phone only | Running your ledger | You control it on your device. For your customers' data **you** are the controller; we do not receive it |
| Encrypted Pro cloud backup (unreadable to us) + opaque backup id | Vercel Blob (USA) | Backup and restore across phones | Contract (Pro service) |
| Email, plan, payment status, Stripe ids | Stripe; our server checks the status | Billing, receipts, proving Pro | Contract; legal obligation (tax/accounting records) |
| Country code from our hosting provider (`/api/geo`) | Your phone only (cached) | Show local wording and default currency | Legitimate interest (not stored or logged by us) |
| Anonymous counts: event name + channel tag | Our analytics store | Know which channels bring users | Legitimate interest (no personal data) |
| IP address | Memory only, salted hash, cleared every minute | Rate limiting / abuse protection | Legitimate interest |
| Server request logs | Vercel | Security and reliability | Legitimate interest |

## 4. Your customers' data
When you record your customers in BashiBook, you decide what is recorded and why. You should tell your customers you keep a credit record and only message them about their account. BashiBook only opens WhatsApp or SMS on your phone; it does not send messages for you.

## 5. Sharing and processors
- **Stripe** (payments) — [Stripe entity], USA/Ireland.
- **Vercel** (hosting, cloud backup storage, logs) — Vercel Inc., USA.
- [Upstash (anonymous counters), if enabled.]
We do not share personal data with anyone else unless the law requires it.

## 6. Cross-border transfers (NDPA Part VIII)
Stripe and Vercel process data outside Nigeria. We rely on [adequacy decision / contractual safeguards (standard contractual clauses) / your consent] as allowed by NDPA s.41–43. Cloud backups are end-to-end encrypted before they leave your phone.

## 7. How long we keep data
- Ledger on your phone: until you delete it or erase the app's data.
- Cloud backup: while Pro is active and [90 days] after; deleted sooner on request.
- Billing records: [6 years] for tax/accounting law.
- Anonymous counts: aggregated monthly, no personal data.

## 8. Security
Encryption on the device (AES-GCM, PBKDF2), HTTPS only, strict security headers, optional PIN lock on the app, no recovery code stored by us.

## 9. Your rights (NDPA s.34–38)
You can ask to access, correct, delete or port your data, object to processing, withdraw consent, and not be subject to purely automated decisions. Most of your data is already on your phone and in your control. Contact [privacy email]; we will answer within [30] days. You can also complain to the **Nigeria Data Protection Commission** (ndpc.gov.ng).

## 10. Children
BashiBook is for shop owners and is not meant for people under 18.

## 11. Breach notification
If a breach is likely to put your rights at risk, we will tell the NDPC within 72 hours and tell you without undue delay, as NDPA s.40 requires.

## 12. Changes
We will update this notice in the app and change the date above.
