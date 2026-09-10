import { useEffect, useState } from 'preact/hooks';
import { MoneyInput } from '../components/MoneyInput';
import { notifyChanged } from '../components/StatusBadge';
import { getCustomer, listCustomers, softDeleteCustomer, upsertCustomer } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import {
  isContactPickerSupported,
  pickContacts,
  type PickedContact,
} from '../lib/contacts';
import { parseNairaToKobo } from '../lib/money';
import { navigate } from '../lib/router';
import { normalizeNgWhatsAppDigits } from '../lib/sms';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  id?: string;
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

/** Display dates as dd/mm/yyyy for Nigeria (browsers ignore locale on type=date). */
function toDateDisplay(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const y = d.getFullYear();
  return `${day}/${m}/${y}`;
}

/** Parse dd/mm/yyyy. Returns null if empty, undefined if invalid. */
function fromDateDisplay(v: string): number | null | undefined {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const d = new Date(year, month - 1, day, 12, 0, 0);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return undefined;
  }
  return d.getTime();
}

/** Dedupe key only — storage keeps raw phone as today. */
function phoneDedupeKey(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  return normalizeNgWhatsAppDigits(raw) || raw.replace(/\D/g, '') || null;
}

export function CustomerFormPage({ id, toast }: Props) {
  const { t } = useLocale();
  const editing = Boolean(id);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactsSupported] = useState(() => isContactPickerSupported());

  useEffect(() => {
    if (!id) return;
    getCustomer(id).then((c) => {
      if (!c) {
        toast(t('customer.notFound'));
        navigate('/');
        return;
      }
      setName(c.name);
      setPhone(c.phone || '');
      setNote(c.note || '');
      setDueDate(toDateDisplay(c.dueAt));
      if (c.creditLimitKobo != null && c.creditLimitKobo > 0) {
        const naira = c.creditLimitKobo / 100;
        setCreditLimit(
          Number.isInteger(naira) ? String(naira) : naira.toFixed(2),
        );
      } else {
        setCreditLimit('');
      }
    });
  }, [id]);

  const applySingleContact = (c: PickedContact) => {
    if (c.name) setName(c.name.slice(0, 80));
    if (c.phone) setPhone(c.phone);
  };

  const addManyFromContacts = async (picked: PickedContact[]) => {
    const withNames = picked.filter((c) => c.name.trim());
    if (withNames.length === 0) {
      toast(t('customerForm.contactsNone'));
      return;
    }
    if (
      !confirm(t('customerForm.contactsConfirm', { n: withNames.length }))
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const existing = await listCustomers();
      const knownPhones = new Set<string>();
      for (const c of existing) {
        const key = phoneDedupeKey(c.phone);
        if (key) knownPhones.add(key);
      }
      let added = 0;
      let skipped = 0;
      for (const c of withNames) {
        const rawPhone = c.phone.trim() || undefined;
        const key = phoneDedupeKey(rawPhone);
        if (key && knownPhones.has(key)) {
          skipped += 1;
          continue;
        }
        await upsertCustomer({
          name: c.name.slice(0, 80),
          phone: rawPhone,
        });
        if (key) knownPhones.add(key);
        added += 1;
      }
      notifyChanged();
      if (added === 0) {
        toast(t('customerForm.contactsAllDupes'));
      } else if (skipped > 0) {
        toast(t('customerForm.contactsAddedSome', { n: added, skipped }));
      } else {
        toast(t('customerForm.contactsAdded', { n: added }));
      }
      navigate('/');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('customerForm.saveFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  const fromContacts = async () => {
    if (busy) return;
    if (!contactsSupported) {
      toast(t('customerForm.contactsUnsupported'));
      return;
    }
    try {
      // Multiple only on new customer; edit refills a single pick into fields
      const picked = await pickContacts({ multiple: !editing });
      if (picked.length === 0) return; // cancel / empty — silent
      if (editing || picked.length === 1) {
        applySingleContact(picked[0]);
        return;
      }
      await addManyFromContacts(picked);
    } catch {
      toast(t('customerForm.contactsFailed'));
    }
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('customerForm.nameRequired'));
      return;
    }
    const dueAt = fromDateDisplay(dueDate);
    if (dueAt === undefined) {
      setError(t('customerForm.dueDateInvalid'));
      return;
    }
    let creditLimitKobo: number | null = null;
    if (creditLimit.trim()) {
      const parsed = parseNairaToKobo(creditLimit);
      if (parsed === null || parsed <= 0) {
        setError(t('customerForm.creditLimitInvalid'));
        return;
      }
      creditLimitKobo = parsed;
    }
    setBusy(true);
    setError(null);
    try {
      const c = await upsertCustomer({
        id,
        name,
        phone: phone || undefined,
        note: note || undefined,
        dueAt: dueAt === null ? null : dueAt,
        creditLimitKobo,
      });
      notifyChanged();
      toast(editing ? t('customerForm.updated') : t('customerForm.added'));
      navigate(`/customers/${c.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('customerForm.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    if (!confirm(t('customerForm.removeConfirm'))) {
      return;
    }
    setBusy(true);
    try {
      await softDeleteCustomer(id);
      notifyChanged();
      toast(t('customerForm.removed'));
      navigate('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="app-shell">
      <header class="topbar">
        <button
          class="icon-btn"
          type="button"
          aria-label={t('common.back')}
          onClick={() => (id ? navigate(`/customers/${id}`) : navigate('/'))}
        >
          ←
        </button>
        <h1>{editing ? t('customerForm.edit') : t('customerForm.new')}</h1>
      </header>
      <main class="main">
        <form class="card" onSubmit={submit}>
          <div class="btn-row" style={{ marginTop: 0, marginBottom: 12 }}>
            <button
              class="btn btn-secondary"
              type="button"
              disabled={busy}
              onClick={fromContacts}
            >
              {t('customerForm.fromContacts')}
            </button>
          </div>
          <div class="field">
            <label for="cname">{t('customerForm.name')}</label>
            <input
              id="cname"
              class="input"
              value={name}
              autofocus
              maxlength={80}
              placeholder={t('customerForm.namePlaceholder')}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="field">
            <label for="cphone">{t('customerForm.phone')}</label>
            <div class="input-with-action">
              <input
                id="cphone"
                class="input"
                type="tel"
                inputMode="tel"
                value={phone}
                placeholder={t('customerForm.phonePlaceholder')}
                onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                class="icon-btn input-action"
                aria-label={t('customerForm.fromContacts')}
                disabled={busy}
                onClick={fromContacts}
              >
                📇
              </button>
            </div>
            <div class="hint">{t('customerForm.phoneHint')}</div>
          </div>
          <div class="field">
            <label for="cdue">{t('customerForm.dueDate')}</label>
            <input
              id="cdue"
              class="input"
              type="text"
              inputMode="numeric"
              autocomplete="off"
              placeholder={t('customerForm.dueDatePlaceholder')}
              value={dueDate}
              onInput={(e) => setDueDate((e.target as HTMLInputElement).value)}
            />
            <div class="hint">
              {t('customerForm.dueDateFormat')} · {t('customerForm.dueHint')}
            </div>
          </div>
          <MoneyInput
            id="climit"
            label={t('customerForm.creditLimit')}
            value={creditLimit}
            onInput={setCreditLimit}
          />
          <div class="hint" style={{ marginTop: -4, marginBottom: 12 }}>
            {t('customerForm.creditLimitHint')}
          </div>
          <div class="field">
            <label for="cnote">{t('customerForm.note')}</label>
            <textarea
              id="cnote"
              class="textarea"
              value={note}
              maxlength={200}
              placeholder={t('customerForm.notePlaceholder')}
              onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
            />
          </div>
          {error && (
            <p style={{ color: 'var(--danger)', marginTop: 0 }}>{error}</p>
          )}
          <button class="btn btn-primary" type="submit" disabled={busy}>
            {busy
              ? t('common.saving')
              : editing
                ? t('customerForm.saveChanges')
                : t('customerForm.add')}
          </button>
          {editing && (
            <div class="btn-row">
              <button
                class="btn btn-danger"
                type="button"
                disabled={busy}
                onClick={remove}
              >
                {t('customerForm.remove')}
              </button>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
