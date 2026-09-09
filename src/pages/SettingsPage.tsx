import { useEffect, useRef, useState } from 'preact/hooks';
import { notifyChanged, StatusBadge } from '../components/StatusBadge';
import { countPendingOutbox, flushOutboxStub, listPendingOutbox } from '../db/outbox';
import {
  clearPin,
  getDashboardBalances,
  getShop,
  listCustomers,
  listEntriesForCustomer,
  saveShop,
  setCloudBackupMeta,
  setPin,
  setShopLocale,
} from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import { useOnline } from '../hooks/useOnline';
import {
  LOCALE_OPTIONS,
  localeNativeName,
  t as tNow,
  type Locale,
  type MessageKey,
} from '../i18n';
import { downloadJson, exportBackup, importBackup, readJsonFile } from '../lib/backup';
import {
  decryptBackup,
  deriveBackupId,
  encryptBackup,
  formatRecoveryCode,
  generateRecoveryCode,
  isValidRecoveryCode,
} from '../lib/cloudBackup';
import {
  CloudBackupApiError,
  fetchCloudBackup,
  uploadCloudBackup,
} from '../lib/cloudBackupApi';
import { buildCsvExport, downloadCsv } from '../lib/csv';
import { getEntitlement, isPro } from '../lib/entitlement';
import {
  FEEDBACK_TOPICS,
  buildFeedbackMessage,
  copyFeedback,
  openFeedbackWhatsApp,
  rememberFeedbackSent,
  type FeedbackTopicId,
} from '../lib/feedback';
import { hashPin, isValidPin, randomSalt } from '../lib/pin';
import { navigate } from '../lib/router';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
  onPinChanged?: () => void;
}

export function SettingsPage({ toast, onPinChanged }: Props) {
  const { locale, setLocale, t } = useLocale();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [showPinForm, setShowPinForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackTopics, setFeedbackTopics] = useState<FeedbackTopicId[]>([]);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [pro, setPro] = useState(false);
  const [entLabel, setEntLabel] = useState('Free');
  const [expLabel, setExpLabel] = useState('');
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [lastCloudAt, setLastCloudAt] = useState<number | undefined>();
  const [showCloudEnable, setShowCloudEnable] = useState(false);
  const [pendingRecoveryCode, setPendingRecoveryCode] = useState('');
  const [showCloudRestore, setShowCloudRestore] = useState(false);
  const [restoreCode, setRestoreCode] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const online = useOnline();

  const refresh = async () => {
    const s = await getShop();
    if (s) {
      setName(s.name);
      setHasPin(Boolean(s.pinHash && s.pinSalt));
      setPro(isPro(s));
      const e = getEntitlement(s);
      setEntLabel(e.plan === 'pro' ? t('common.pro') : t('common.free'));
      setExpLabel(
        e.plan === 'pro' && e.exp
          ? t('settings.until', {
              date: new Date(e.exp).toLocaleDateString('en-NG'),
            })
          : e.plan === 'pro' && e.source
            ? String(e.source)
            : t('settings.ledgerBackupPin'),
      );
      setCloudEnabled(Boolean(s.cloudBackupEnabled && s.cloudBackupId));
      setLastCloudAt(s.lastCloudBackupAt);
    }
    setPending(await countPendingOutbox());
  };

  useEffect(() => {
    refresh();
  }, [locale]);

  const changeLanguage = async (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    try {
      await setShopLocale(next);
    } catch {
      /* shop may not exist yet — localStorage is enough */
    }
    // Toast in the NEW language
    toast(tNow('settings.languageChanged', { lang: localeNativeName(next) }, next));
  };

  const save = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) {
      toast(t('settings.shopNameRequired'));
      return;
    }
    setBusy(true);
    try {
      await saveShop(name);
      notifyChanged();
      toast(t('settings.shopUpdated'));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const flush = async () => {
    const items = await listPendingOutbox();
    if (items.length === 0) {
      toast(t('settings.nothingPending'));
      return;
    }
    const n = await flushOutboxStub();
    notifyChanged();
    setPending(await countPendingOutbox());
    toast(t('settings.markedSynced', { n }));
  };

  const savePin = async () => {
    if (!isValidPin(pinInput)) {
      toast(t('settings.pinMustBe4'));
      return;
    }
    const salt = randomSalt();
    const hash = await hashPin(salt, pinInput);
    await setPin(hash, salt);
    setPinInput('');
    setShowPinForm(false);
    notifyChanged();
    onPinChanged?.();
    await refresh();
    toast(t('settings.pinEnabled'));
  };

  const removePin = async () => {
    if (!confirm(t('settings.removePinConfirm'))) return;
    await clearPin();
    setShowPinForm(false);
    onPinChanged?.();
    await refresh();
    toast(t('settings.pinRemoved'));
  };

  const doExport = async () => {
    const data = await exportBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`debtbook-backup-${stamp}.json`, data);
    toast(t('settings.backupDownloaded'));
  };

  const doImport = async (file: File) => {
    if (!confirm(t('settings.importConfirm'))) {
      return;
    }
    try {
      const data = await readJsonFile(file);
      const result = await importBackup(data);
      notifyChanged();
      await refresh();
      toast(
        t('settings.imported', {
          customers: result.customers,
          entries: result.entries,
        }),
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : t('settings.importFailed'));
    }
  };

  const doCsv = async () => {
    if (!pro) {
      toast(t('settings.csvPro'), {
        ms: 5000,
        action: {
          label: t('common.upgrade'),
          onClick: () => navigate('/settings/pro'),
        },
      });
      return;
    }
    const dash = await getDashboardBalances();
    const map = new Map<string, Awaited<ReturnType<typeof listEntriesForCustomer>>>();
    for (const row of dash.customers) {
      map.set(row.customer.id, await listEntriesForCustomer(row.customer.id));
    }
    const csv = buildCsvExport(dash.customers, map);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`debtbook-export-${stamp}.csv`, csv);
    toast(t('settings.csvDownloaded'));
  };

  const proGateCloud = (): boolean => {
    if (!pro) {
      toast(t('settings.cloudPro'), {
        ms: 5000,
        action: {
          label: t('common.upgrade'),
          onClick: () => navigate('/settings/pro'),
        },
      });
      return false;
    }
    return true;
  };

  const startCloudEnable = () => {
    if (!proGateCloud()) return;
    if (!online) {
      toast(t('settings.offlineEnableCloud'));
      return;
    }
    setPendingRecoveryCode(generateRecoveryCode());
    setShowCloudEnable(true);
    setShowCloudRestore(false);
  };

  const cancelCloudEnable = () => {
    setShowCloudEnable(false);
    setPendingRecoveryCode('');
  };

  const confirmCloudEnable = async () => {
    if (!pendingRecoveryCode) return;
    if (!confirm(t('settings.cloudConfirmSaved'))) {
      return;
    }
    setCloudBusy(true);
    try {
      const payload = await exportBackup();
      const enc = await encryptBackup(payload, pendingRecoveryCode);
      await uploadCloudBackup(enc);
      await setCloudBackupMeta({
        cloudBackupEnabled: true,
        cloudBackupId: enc.backupId,
        lastCloudBackupAt: Date.now(),
      });
      setShowCloudEnable(false);
      setPendingRecoveryCode('');
      notifyChanged();
      await refresh();
      toast(t('settings.cloudEnabled'));
    } catch (err) {
      const msg =
        err instanceof CloudBackupApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('settings.cloudFailed');
      toast(msg);
    } finally {
      setCloudBusy(false);
    }
  };

  const doCloudBackupNow = async () => {
    if (!proGateCloud()) return;
    if (!online) {
      toast(t('settings.offlineUploadCloud'));
      return;
    }
    const s = await getShop();
    if (!s?.cloudBackupId) {
      startCloudEnable();
      return;
    }
    const code = prompt(t('settings.recoveryPrompt'));
    if (!code) return;
    if (!isValidRecoveryCode(code)) {
      toast(t('settings.invalidRecoveryFormat'));
      return;
    }
    setCloudBusy(true);
    try {
      const id = await deriveBackupId(code);
      if (s.cloudBackupId && id !== s.cloudBackupId) {
        toast(t('settings.recoveryMismatch'));
        return;
      }
      const payload = await exportBackup();
      const enc = await encryptBackup(payload, code);
      await uploadCloudBackup(enc);
      await setCloudBackupMeta({
        cloudBackupEnabled: true,
        cloudBackupId: enc.backupId,
        lastCloudBackupAt: Date.now(),
      });
      notifyChanged();
      await refresh();
      toast(t('settings.cloudUploaded'));
    } catch (err) {
      const msg =
        err instanceof CloudBackupApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('settings.cloudFailed');
      toast(msg);
    } finally {
      setCloudBusy(false);
    }
  };

  const onCloudBackupRow = () => {
    if (!proGateCloud()) return;
    if (cloudEnabled) {
      doCloudBackupNow();
    } else {
      startCloudEnable();
    }
  };

  const doCloudRestore = async () => {
    if (!online) {
      toast(t('settings.offlineRestoreCloud'));
      return;
    }
    if (!isValidRecoveryCode(restoreCode)) {
      toast(t('settings.invalidRecoveryFormat'));
      return;
    }
    if (!confirm(t('settings.restoreCloudConfirm'))) {
      return;
    }
    setCloudBusy(true);
    try {
      const backupId = await deriveBackupId(restoreCode);
      const blob = await fetchCloudBackup(backupId);
      const data = await decryptBackup(blob, restoreCode);
      const result = await importBackup(data);
      await setCloudBackupMeta({
        cloudBackupEnabled: true,
        cloudBackupId: backupId,
        lastCloudBackupAt: blob.meta?.exportedAt || Date.now(),
      });
      setShowCloudRestore(false);
      setRestoreCode('');
      notifyChanged();
      await refresh();
      toast(
        t('settings.restored', {
          customers: result.customers,
          entries: result.entries,
        }),
      );
    } catch (err) {
      const msg =
        err instanceof CloudBackupApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('settings.cloudRestoreFailed');
      toast(msg);
    } finally {
      setCloudBusy(false);
    }
  };

  const copyRecoveryCode = async () => {
    try {
      await navigator.clipboard.writeText(pendingRecoveryCode);
      toast(t('settings.recoveryCopied'));
    } catch {
      toast(t('settings.copyFailedWrite'));
    }
  };

  const toggleFeedbackTopic = (id: FeedbackTopicId) => {
    setFeedbackTopics((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const composeFeedback = async () => {
    let customerCount: number | undefined;
    try {
      const customers = await listCustomers();
      customerCount = customers.length;
    } catch {
      /* skip count if DB unavailable */
    }
    return buildFeedbackMessage({
      topicIds: feedbackTopics,
      note: feedbackNote,
      shopName: name.trim() || undefined,
      plan: entLabel,
      customerCount,
      appVersion: 'DebtBook',
    });
  };

  const sendFeedbackWhatsApp = async () => {
    const text = await composeFeedback();
    openFeedbackWhatsApp(text);
    rememberFeedbackSent();
    toast(t('settings.thanksWhatsApp'));
  };

  const copyFeedbackMessage = async () => {
    const text = await composeFeedback();
    const ok = await copyFeedback(text);
    if (ok) {
      rememberFeedbackSent();
      toast(t('settings.thanksCopied'));
    } else {
      toast(t('settings.copyFailedWhatsApp'));
    }
  };

  const feedbackLabel = (id: FeedbackTopicId): string => {
    return t(`feedback.topic.${id}` as MessageKey);
  };

  const initial = name.trim().charAt(0).toUpperCase() || 'D';
  const lastCloudLabel = lastCloudAt
    ? t('settings.cloudLast', {
        when: new Date(lastCloudAt).toLocaleString('en-NG'),
      })
    : t('settings.cloudEncrypted');

  return (
    <div class="app-shell">
      <header class="topbar">
        <button
          class="icon-btn"
          type="button"
          aria-label={t('common.back')}
          onClick={() => navigate('/')}
        >
          ←
        </button>
        <h1>{t('settings.title')}</h1>
        <StatusBadge />
      </header>
      <main class="main settings-main">
        <section class="settings-hero card">
          <div class="settings-avatar" aria-hidden="true">
            {initial}
          </div>
          <div class="settings-hero-text">
            <div class="settings-hero-name">{name.trim() || t('settings.yourShop')}</div>
            <div class="settings-hero-meta">
              <span class={pro ? 'plan-pill plan-pill-pro' : 'plan-pill'}>
                {entLabel}
              </span>
              <span class="muted">{expLabel}</span>
            </div>
          </div>
        </section>

        <div class="settings-group-label">{t('settings.shop')}</div>
        <form class="settings-group card" onSubmit={save}>
          <div class="field" style={{ marginBottom: 0 }}>
            <label for="shop">{t('settings.shopName')}</label>
            <input
              id="shop"
              class="input"
              value={name}
              maxlength={80}
              autocomplete="organization"
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </div>
          <button class="btn btn-primary" type="submit" disabled={busy}>
            {t('settings.saveShopName')}
          </button>
        </form>

        <div class="settings-group-label">{t('settings.language')}</div>
        <div class="settings-group card settings-list" role="radiogroup" aria-label={t('settings.language')}>
          {LOCALE_OPTIONS.map((opt) => {
            const on = locale === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                class="settings-row"
                role="radio"
                aria-checked={on}
                onClick={() => changeLanguage(opt.id)}
              >
                <span class="settings-row-icon" aria-hidden="true">
                  🌐
                </span>
                <span class="settings-row-body">
                  <span class="settings-row-title">{opt.nativeName}</span>
                </span>
                <span class="settings-row-trail">
                  <span class={on ? 'status-dot on' : 'status-dot'} />
                  {on ? t('common.on') : ''}
                </span>
              </button>
            );
          })}
        </div>

        <div class="settings-group-label">{t('settings.planExport')}</div>
        <div class="settings-group card settings-list">
          <button
            type="button"
            class="settings-row"
            onClick={() => navigate('/settings/pro')}
          >
            <span class="settings-row-icon" aria-hidden="true">
              ★
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">{t('settings.proTitle')}</span>
              <span class="settings-row-sub">
                {pro ? t('settings.proSubPro') : t('settings.proSubFree')}
              </span>
            </span>
            <span class="settings-row-trail">
              {pro ? t('common.pro') : t('common.free')}
              <span class="chev" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
          <button type="button" class="settings-row" onClick={doCsv}>
            <span class="settings-row-icon" aria-hidden="true">
              ⬇
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">{t('settings.exportCsv')}</span>
              <span class="settings-row-sub">
                {pro ? t('settings.exportCsvSubPro') : t('settings.exportCsvSubFree')}
              </span>
            </span>
            <span class="settings-row-trail">
              {pro ? '' : t('common.pro')}
              <span class="chev" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
        </div>

        <div class="settings-group-label">{t('settings.security')}</div>
        <div class="settings-group card settings-list">
          <button
            type="button"
            class="settings-row"
            onClick={() => {
              if (hasPin) {
                removePin();
              } else {
                setShowPinForm((v) => !v);
              }
            }}
          >
            <span class="settings-row-icon" aria-hidden="true">
              🔒
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">{t('settings.pinLock')}</span>
              <span class="settings-row-sub">
                {hasPin ? t('settings.pinOn') : t('settings.pinOff')}
              </span>
            </span>
            <span class="settings-row-trail">
              <span class={hasPin ? 'status-dot on' : 'status-dot'} />
              {hasPin ? t('common.on') : t('common.off')}
            </span>
          </button>
          {showPinForm && !hasPin && (
            <div class="settings-row-panel">
              <div class="field">
                <label for="pin">{t('settings.newPin')}</label>
                <input
                  id="pin"
                  class="input"
                  inputMode="numeric"
                  maxlength={4}
                  value={pinInput}
                  placeholder="••••"
                  autocomplete="off"
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value
                      .replace(/\D/g, '')
                      .slice(0, 4);
                    setPinInput(v);
                  }}
                />
              </div>
              <div class="btn-row" style={{ marginTop: 0 }}>
                <button class="btn btn-secondary" type="button" onClick={savePin}>
                  {t('settings.enablePin')}
                </button>
                <button
                  class="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setShowPinForm(false);
                    setPinInput('');
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div class="settings-group-label">{t('settings.backup')}</div>
        <div class="settings-group card settings-list">
          <button type="button" class="settings-row" onClick={doExport}>
            <span class="settings-row-icon" aria-hidden="true">
              💾
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">{t('settings.exportBackup')}</span>
              <span class="settings-row-sub">{t('settings.exportBackupSub')}</span>
            </span>
            <span class="settings-row-trail">
              <span class="chev" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
          <button
            type="button"
            class="settings-row"
            onClick={() => fileRef.current?.click()}
          >
            <span class="settings-row-icon" aria-hidden="true">
              ↩
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">{t('settings.restoreBackup')}</span>
              <span class="settings-row-sub">{t('settings.restoreBackupSub')}</span>
            </span>
            <span class="settings-row-trail">
              <span class="chev" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            class="sr-only"
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) doImport(f);
              (e.target as HTMLInputElement).value = '';
            }}
          />
          <button
            type="button"
            class="settings-row"
            disabled={cloudBusy}
            onClick={onCloudBackupRow}
          >
            <span class="settings-row-icon" aria-hidden="true">
              ☁
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">
                {cloudEnabled ? t('settings.backupNow') : t('settings.cloudBackup')}
              </span>
              <span class="settings-row-sub">
                {pro
                  ? cloudEnabled
                    ? lastCloudLabel
                    : t('settings.cloudEnableSub')
                  : t('settings.proFeature')}
              </span>
            </span>
            <span class="settings-row-trail">
              {pro ? (cloudEnabled ? t('common.on') : '') : t('common.pro')}
              <span class="chev" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
          {showCloudEnable && (
            <div class="settings-row-panel">
              <p class="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
                {t('settings.recoveryCodeHelp')}
              </p>
              <div
                class="input"
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: '0.8rem',
                  wordBreak: 'break-all',
                  userSelect: 'all',
                }}
              >
                {formatRecoveryCode(pendingRecoveryCode)}
              </div>
              <div class="btn-row" style={{ marginTop: 8 }}>
                <button
                  class="btn btn-secondary"
                  type="button"
                  onClick={copyRecoveryCode}
                >
                  {t('settings.copyCode')}
                </button>
                <button
                  class="btn btn-primary"
                  type="button"
                  disabled={cloudBusy}
                  onClick={confirmCloudEnable}
                >
                  {cloudBusy ? t('settings.uploading') : t('settings.iSavedIt')}
                </button>
                <button
                  class="btn btn-ghost"
                  type="button"
                  disabled={cloudBusy}
                  onClick={cancelCloudEnable}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            class="settings-row"
            disabled={cloudBusy}
            onClick={() => {
              if (!proGateCloud()) return;
              if (!online) {
                toast(t('settings.offlineRestoreCloud'));
                return;
              }
              setShowCloudRestore((v) => !v);
              setShowCloudEnable(false);
            }}
          >
            <span class="settings-row-icon" aria-hidden="true">
              ☁↩
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">{t('settings.restoreFromCloud')}</span>
              <span class="settings-row-sub">
                {pro ? t('settings.restoreFromCloudSub') : t('settings.proFeature')}
              </span>
            </span>
            <span class="settings-row-trail">
              {pro ? '' : t('common.pro')}
              <span class="chev" aria-hidden="true">
                {showCloudRestore ? '˅' : '›'}
              </span>
            </span>
          </button>
          {showCloudRestore && (
            <div class="settings-row-panel">
              <div class="field">
                <label for="recovery">{t('settings.recoveryCode')}</label>
                <input
                  id="recovery"
                  class="input"
                  value={restoreCode}
                  placeholder="XXXX-XXXX-XXXX-XXXX-…"
                  autocomplete="off"
                  autocapitalize="characters"
                  onInput={(e) =>
                    setRestoreCode((e.target as HTMLInputElement).value)
                  }
                />
              </div>
              <div class="btn-row" style={{ marginTop: 0 }}>
                <button
                  class="btn btn-primary"
                  type="button"
                  disabled={cloudBusy}
                  onClick={doCloudRestore}
                >
                  {cloudBusy
                    ? t('settings.restoring')
                    : t('settings.downloadRestore')}
                </button>
                <button
                  class="btn btn-ghost"
                  type="button"
                  disabled={cloudBusy}
                  onClick={() => {
                    setShowCloudRestore(false);
                    setRestoreCode('');
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div class="settings-group-label">{t('settings.feedback')}</div>
        <div class="settings-group card settings-list">
          <button
            type="button"
            class="settings-row"
            onClick={() => setShowFeedback((v) => !v)}
          >
            <span class="settings-row-icon" aria-hidden="true">
              💬
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">{t('settings.sendFeedback')}</span>
              <span class="settings-row-sub">{t('settings.whatBroke')}</span>
            </span>
            <span class="settings-row-trail">
              <span class="chev" aria-hidden="true">
                {showFeedback ? '˅' : '›'}
              </span>
            </span>
          </button>
          {showFeedback && (
            <div class="settings-row-panel">
              <div class="chip-row" role="group" aria-label={t('settings.feedbackTopics')}>
                {FEEDBACK_TOPICS.map((topic) => {
                  const on = feedbackTopics.includes(topic.id);
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      class={on ? 'chip on' : 'chip'}
                      aria-pressed={on}
                      onClick={() => toggleFeedbackTopic(topic.id)}
                    >
                      {feedbackLabel(topic.id)}
                    </button>
                  );
                })}
              </div>
              <div class="field">
                <label for="feedback-note">{t('settings.whatBrokeOptional')}</label>
                <textarea
                  id="feedback-note"
                  class="input"
                  rows={3}
                  maxlength={500}
                  value={feedbackNote}
                  placeholder={t('settings.feedbackPlaceholder')}
                  onInput={(e) =>
                    setFeedbackNote((e.target as HTMLTextAreaElement).value)
                  }
                />
              </div>
              <div class="btn-row" style={{ marginTop: 0 }}>
                <button
                  class="btn btn-primary"
                  type="button"
                  onClick={sendFeedbackWhatsApp}
                >
                  {t('settings.sendWhatsApp')}
                </button>
                <button
                  class="btn btn-secondary"
                  type="button"
                  onClick={copyFeedbackMessage}
                >
                  {t('common.copy')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div class="settings-group-label">{t('settings.more')}</div>
        <div class="settings-group card settings-list">
          <button
            type="button"
            class="settings-row"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span class="settings-row-icon" aria-hidden="true">
              ⚙
            </span>
            <span class="settings-row-body">
              <span class="settings-row-title">{t('settings.syncAdvanced')}</span>
              <span class="settings-row-sub">
                {t('settings.syncPending', {
                  online: online ? t('common.online') : t('common.offline'),
                  n: pending,
                })}
              </span>
            </span>
            <span class="settings-row-trail">
              <span class="chev" aria-hidden="true">
                {showAdvanced ? '˅' : '›'}
              </span>
            </span>
          </button>
          {showAdvanced && (
            <div class="settings-row-panel">
              <p class="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
                {t('settings.syncAdvancedHelp')}
              </p>
              <button class="btn btn-secondary" type="button" onClick={flush}>
                {t('settings.flushOutbox')}
              </button>
            </div>
          )}
        </div>

        <p class="settings-about muted">
          {t('settings.aboutLine1', { lang: localeNativeName(locale) })}
          <br />
          {t('settings.aboutLine2')}
        </p>
      </main>
    </div>
  );
}
