import { useEffect, useState } from 'preact/hooks';
import { notifyChanged } from '../components/StatusBadge';
import { getCustomer, softDeleteCustomer, upsertCustomer } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import { navigate } from '../lib/router';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  id?: string;
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

function toDateInput(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromDateInput(v: string): number | null {
  if (!v.trim()) return null;
  const d = new Date(v + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

export function CustomerFormPage({ id, toast }: Props) {
  const { t } = useLocale();
  const editing = Boolean(id);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setDueDate(toDateInput(c.dueAt));
    });
  }, [id]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('customerForm.nameRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dueAt = fromDateInput(dueDate);
      const c = await upsertCustomer({
        id,
        name,
        phone: phone || undefined,
        note: note || undefined,
        dueAt: dueAt === null ? null : dueAt,
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
            <input
              id="cphone"
              class="input"
              type="tel"
              inputMode="tel"
              value={phone}
              placeholder={t('customerForm.phonePlaceholder')}
              onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
            />
            <div class="hint">{t('customerForm.phoneHint')}</div>
          </div>
          <div class="field">
            <label for="cdue">{t('customerForm.dueDate')}</label>
            <input
              id="cdue"
              class="input"
              type="date"
              value={dueDate}
              onInput={(e) => setDueDate((e.target as HTMLInputElement).value)}
            />
            <div class="hint">{t('customerForm.dueHint')}</div>
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
