# BashiBook Privacy Notice (outside Nigeria) — DRAFT

> DRAFT for legal review. A GDPR/UK-GDPR-style baseline for users outside Nigeria; check local law (e.g. Ghana Data Protection Act, Kenya DPA, South Africa POPIA) before publishing in a specific market. Not legal advice.

Last updated: [date]

## Who is responsible
[Operator legal name], [address]. Privacy contact: [privacy email]. [EU/UK representative, if required.]

## The short version
Your shop book is stored on your phone. We only receive data when you pay for Pro (email and payment status via Stripe) or turn on Pro cloud backup (encrypted on your phone; we cannot read it). No ads, no selling of data.

## What we process

| Data | Purpose | Legal basis |
| --- | --- | --- |
| Ledger data (shop, customers, suppliers, amounts, notes, payment details) | Stays on your device; we never receive it | — (you control it; for your customers' data you are the controller) |
| Encrypted cloud backup + opaque id | Pro backup/restore | Performance of contract |
| Email, plan, payment status, Stripe ids | Billing and receipts | Contract; legal obligation |
| Country code (`/api/geo`) | Local wording and default currency; cached on your phone, not stored or logged by us | Legitimate interests |
| Anonymous event counts (event + channel tag) | Understanding which channels work | Legitimate interests (no personal data) |
| IP address (in-memory salted hash, cleared each minute) and hosting logs | Security, rate limiting | Legitimate interests |

## Processors and transfers
Stripe (payments) and Vercel (hosting, backup storage) in the USA [and Ireland]. Transfers rely on [Standard Contractual Clauses / the EU-US Data Privacy Framework, where the provider is certified]. Cloud backups are encrypted before leaving your device.

## Retention
Ledger: on your device until you delete it. Cloud backup: while Pro is active and [90 days] after. Billing: [6 years]. Anonymous counts: aggregated.

## Your rights
Access, rectification, erasure, restriction, portability, objection, and complaint to your local data protection authority. Contact [privacy email]; we reply within [30 days].

## Security
On-device AES-GCM encryption, HTTPS, strict security headers, optional app PIN. We never store your recovery code, so we cannot restore a cloud backup without it.

## Children
Not intended for people under [16/18].

## Changes
Updated in the app with a new date.
