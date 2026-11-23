import { beforeAll, describe, expect, it } from 'vitest';
import { initLocale, setLocale, t } from '../i18n';
import { en } from '../i18n/locales/en';
import { ha } from '../i18n/locales/ha';
import { yo } from '../i18n/locales/yo';
import entryFormSrc from '../pages/EntryFormPage.tsx?raw';
import { buildEntryReceiptMessage } from './sms';

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  }
  initLocale('en');
  setLocale('en');
});

describe('receipt step after a payment', () => {
  it('payments that do not trigger the paid-in-full invite go to the receipt step, not straight back', () => {
    const src = entryFormSrc;
    const paidCheck = src.indexOf('shouldShowPaidInvite({');
    const paymentReceipt = src.indexOf('setReceiptStep({ entry, balanceKobo: after.balanceKobo');
    expect(paidCheck).toBeGreaterThan(-1);
    // paid-in-full invite keeps priority; receipt step comes after it
    expect(paymentReceipt).toBeGreaterThan(paidCheck);
    // the old direct exit after a payment is gone from submit
    expect(src).not.toMatch(/setPaidStep\(entry\);\s*return;\s*\}\s*finish\(entry\);/);
    // the sheet picks payment wording for payments
    expect(src).toContain("receiptStep.entry.type === 'payment' ? 'entry.receiptStepTitlePayment' : 'entry.receiptStepTitle'");
    expect(src).toContain("receiptStep.entry.type === 'payment' ? 'entry.receiptStepWhyPayment' : 'entry.receiptStepWhy'");
  });

  it('payment wording exists in en/ha/yo and reads plainly', () => {
    for (const cat of [en, ha, yo] as Record<string, string>[]) {
      expect(cat['entry.receiptStepTitlePayment']).toContain('{{amount}}');
      expect(cat['entry.receiptStepTitlePayment']).toContain('{{name}}');
      expect(cat['entry.receiptStepWhyPayment']).toBeTruthy();
    }
    expect(t('entry.receiptStepTitlePayment', { amount: '₦1,000', name: 'Ada' })).toBe('₦1,000 payment saved for Ada');
    // no prices, plans or Pro wording in this step
    expect(en['entry.receiptStepWhyPayment']).not.toMatch(/pro|price|₦|\$|free/i);
  });

  it('a part-payment receipt tells the customer what is still owed', () => {
    const msg = buildEntryReceiptMessage({
      shopName: 'Shop',
      customerName: 'Ada',
      type: 'payment',
      amountKobo: 100000,
      balanceKobo: 150000,
    });
    expect(msg).toContain('received your payment');
    expect(msg).toMatch(/Balance owed: .*1,500/);
  });
});
