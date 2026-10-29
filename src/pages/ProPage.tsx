import { BackButton } from '../components/BackButton';
import { STRIPE_BILLING_PORTAL_URL } from '../config';
import { hit } from '../lib/hit';
import { useEffect, useRef, useState } from 'preact/hooks';
import { notifyChanged } from '../components/StatusBadge';
import { getShop, setEntitlement } from '../db/repo';
import { useLocale } from '../hooks/useLocale';
import { getEntitlement, isPro } from '../lib/entitlement';
import { trialStatus } from '../lib/trial';
import { startTrial, TrialAlreadyUsedError } from '../lib/trialStore';
import {
  clearRefFromHash,
  entitlementFromPayment,
  isVerifiedPayment,
  looksLikeEmail,
  refFromHash,
  rememberEmail,
  rememberedEmail,
  type ProBillingPlan,
} from '../lib/checkoutReturn';
import type { ShopProfile } from '../lib/types';
import type { ToastAction } from '../hooks/useToast';
import { deviceLocale } from '../lib/dates';
import { mayHavePlayBilling, playAppHint } from '../lib/playEnv';
import type { PlayPlan } from '../lib/playBilling';

/** Which checkout this page shows. Inside the Play app it's Google Play Billing only, never Stripe. */
type StoreState = 'checking' | 'web' | 'play' | 'play-unavailable';
const loadPlay = () => import('../lib/playBilling');

interface Props {
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

export function ProPage({ toast }: Props) {
  const { t } = useLocale();
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setShop((await getShop()) || null);
  };

  useEffect(() => {
    refresh();
  }, []);

  const activateDemo = async () => {
    setBusy(true);
    try {
      await startTrial();
      notifyChanged();
      await refresh();
      toast(t('pro.activated'));
    } catch (err) {
      await refresh();
      toast(err instanceof TrialAlreadyUsedError ? t('pro.trialUsedNote') : t('pro.checkoutUnavailable'));
    } finally {
      setBusy(false);
    }
  };

  const [email, setEmail] = useState(rememberedEmail);
  const [emailError, setEmailError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<
    { kind: 'ok' | 'error' | 'offline'; text: string; ref?: string } | null
  >(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const verifyReference = async (ref: string) => {
    setVerifying(true);
    setVerifyMsg(null);
    try {
      const res = await fetch(
        `/api/verify?reference=${encodeURIComponent(ref)}`,
        { cache: 'no-store' },
      );
      const body = (await res.json().catch(() => null)) as unknown;
      if (res.ok && isVerifiedPayment(body)) {
        const current = getEntitlement(await getShop());
        const ent = entitlementFromPayment(body, current, Date.now(), ref);
        await setEntitlement(ent);
        notifyChanged();
        await refresh();
        clearRefFromHash();
        const text = t('pro.paidSuccess', {
          date: new Date(ent.exp || Date.now()).toLocaleDateString(deviceLocale()),
        });
        setVerifyMsg({ kind: 'ok', text });
        toast(text, { ms: 5000 });
        return;
      }
      if (res.status >= 500 && res.status !== 501) {
        setVerifyMsg({ kind: 'offline', text: t('pro.verifyOffline'), ref });
        return;
      }
      clearRefFromHash();
      const text = t('pro.verifyFailed', { ref });
      setVerifyMsg({ kind: 'error', text });
      toast(text, { ms: 6000 });
    } catch {
      setVerifyMsg({ kind: 'offline', text: t('pro.verifyOffline'), ref });
    } finally {
      setVerifying(false);
    }
  };

  // Returning from Stripe Checkout: #/pro?ref=… → verify server-side before unlocking.
  useEffect(() => {
    const check = () => {
      const ref = refFromHash(location.hash);
      if (ref) verifyReference(ref);
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);

  const [store, setStore] = useState<StoreState>(() => (mayHavePlayBilling() ? 'checking' : 'web'));
  const [playPrice, setPlayPrice] = useState<Partial<Record<PlayPlan, string>>>({});
  useEffect(() => {
    if (store !== 'checking') return;
    let live = true;
    loadPlay()
      .then(async (m) => {
        const found = await m.detectStore();
        if (found.store !== 'play' || !found.service) return live && setStore(found.store);
        const [configured, prices] = await Promise.all([m.playConfigured(), m.playPrices(found.service, deviceLocale())]);
        if (!live) return;
        setPlayPrice(prices);
        // 501 not_configured: show "coming soon" instead of taking money we can't verify yet.
        setStore(configured === false ? 'play-unavailable' : 'play');
      })
      .catch(() => live && setStore(playAppHint() ? 'play-unavailable' : 'web'));
    return () => {
      live = false;
    };
  }, []);

  const playDone = async (exp: number | undefined) => {
    notifyChanged();
    await refresh();
    const text = t('pro.paidSuccess', { date: new Date(exp || Date.now()).toLocaleDateString(deviceLocale()) });
    setVerifyMsg({ kind: 'ok', text });
    toast(text, { ms: 5000 });
  };

  const buyPlay = async (p: PlayPlan) => {
    setBusy(true);
    hit('pro_checkout', { once: true });
    try {
      const m = await loadPlay();
      const { result, ent } = await m.buyWithPlay(p, getEntitlement(await getShop()), setEntitlement);
      if (result === 'ok') await playDone(ent?.exp);
      else if (result === 'not_configured') {
        setStore('play-unavailable');
        toast(t('pro.playSoon'));
      } else if (result === 'offline') toast(t('pro.playOffline'), { ms: 6000 });
      else if (result === 'failed') toast(t('pro.playFailed'), { ms: 6000 });
    } catch {
      toast(t('pro.playFailed'));
    } finally {
      setBusy(false);
    }
  };

  const restorePlay = async () => {
    setBusy(true);
    try {
      const m = await loadPlay();
      const before = getEntitlement(await getShop());
      const r = await m.syncPlay(before, setEntitlement, { force: true });
      if (r === 'restored' || r === 'extended') await playDone(getEntitlement(await getShop()).exp);
      else if (r === 'error') toast(t('pro.playFailed'));
      else toast(t('pro.playNothing'));
    } catch {
      toast(t('pro.playFailed'));
    } finally {
      setBusy(false);
    }
  };

  const tryCheckout = async (plan: ProBillingPlan) => {
    const addr = email.trim();
    if (!looksLikeEmail(addr)) {
      setEmailError(true);
      toast(t('pro.emailRequired'));
      emailRef.current?.focus();
      return;
    }
    setEmailError(false);
    rememberEmail(addr);
    setBusy(true);
    hit('pro_checkout', { once: true }); // anonymous, fire-and-forget
    let redirecting = false;
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, email: addr }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        authorization_url?: string;
      };
      if (!res.ok || !body.ok) {
        if (body.code === 'email_required') {
          setEmailError(true);
          toast(t('pro.emailRequired'));
          return;
        }
        toast(
          res.status === 501
            ? t('pro.checkoutNotConfigured')
            : body.message || t('pro.checkoutUnavailable'),
        );
        return;
      }
      if (body.authorization_url && /^https:\/\//.test(body.authorization_url)) {
        redirecting = true;
        toast(t('pro.redirecting'));
        window.location.href = body.authorization_url;
      } else {
        toast(t('pro.noCheckoutUrl'));
      }
    } catch {
      toast(t('pro.checkoutUnavailable'));
    } finally {
      if (!redirecting) setBusy(false);
    }
  };

  const ent = getEntitlement(shop);
  const pro = isPro(shop);
  const canPay = !pro || ent.source === 'demo';
  const trial = trialStatus(shop);
  /** Trial over and not paid: the prompt at the top carries the only pay buttons. */
  const trialEndedPrompt = trial.state === 'ended' && !pro;
  const trialLeft =
    trial.state === 'active'
      ? trial.daysLeft === 1
        ? t('pro.trialOneDayLeft')
        : t('pro.trialDaysLeft', { n: trial.daysLeft })
      : '';

  const [plan, setPlan] = useState<ProBillingPlan>('yearly');
  const usd = (p: ProBillingPlan) => (p === 'yearly' ? '$15' : '$1.99');
  const planPicker = (price: (p: ProBillingPlan) => string) => (
    <div class="pro-plans" role="radiogroup" aria-label={t('pro.planTitle')}>
      {(['yearly', 'monthly'] as ProBillingPlan[]).map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={plan === p}
          class={`pro-plan${plan === p ? ' on' : ''}`}
          onClick={() => setPlan(p)}
        >
          {p === 'yearly' && <span class="pro-plan-tag">{t('pro.planBest')}</span>}
          <span class="pro-plan-dot" aria-hidden="true" />
          <span class="pro-plan-text">
            <span class="pro-plan-name">{t(p === 'yearly' ? 'pro.planYearly' : 'pro.planMonthly')}</span>
            <span class="pro-plan-meta">{t(p === 'yearly' ? 'pro.planYearlyMeta' : 'pro.planMonthlyMeta')}</span>
          </span>
          <span class="pro-plan-price">{price(p)}</span>
        </button>
      ))}
    </div>
  );
  /** Play app: Google Play prices and purchase, no email (Play sends the receipt). */
  const playBlock = (
    <div class={`pro-pay${trialEndedPrompt ? ' in-alert' : ''}`}>
      {!trialEndedPrompt && <h2 class="pro-plan-title">{t('pro.planTitle')}</h2>}
      {store === 'checking' ? (
        <p class="pro-soft-note" role="status">{t('pro.playChecking')}</p>
      ) : store === 'play-unavailable' ? (
        <p class="pro-pay-status" role="status">{t('pro.playSoon')}</p>
      ) : (
        <>
          {planPicker((p) => playPrice[p] || t(p === 'yearly' ? 'pro.perYear' : 'pro.perMonth'))}
          <button
            class={`btn ${!pro && trial.state === 'available' ? 'btn-secondary' : 'btn-primary'} pro-pay-cta`}
            type="button"
            disabled={busy}
            onClick={() => buyPlay(plan)}
          >
            {t('pro.playSubscribe', { price: playPrice[plan] || usd(plan) })}
          </button>
          <p class="pro-soft-note">🔒 {t('pro.playBilledBy')}</p>
          <button class="btn btn-secondary" type="button" disabled={busy} onClick={restorePlay}>
            {t('pro.playRestore')}
          </button>
        </>
      )}
      {!pro && !trialEndedPrompt && <p class="pro-soft-note">{t('pro.demoNote')}</p>}
    </div>
  );
  /** One place to pick a plan, type the receipt email and pay (email sits right above the button). */
  const stripeBlock = (
    <div class={`pro-pay${trialEndedPrompt ? ' in-alert' : ''}`}>
      {!trialEndedPrompt && <h2 class="pro-plan-title">{t('pro.planTitle')}</h2>}
      {planPicker((p) => t(p === 'yearly' ? 'pro.perYear' : 'pro.perMonth'))}
      <div class="field">
        <label for="pro-pay-email">{t('pro.emailLabel')}</label>
        <input
          id="pro-pay-email"
          ref={emailRef}
          class={`input${emailError ? ' input-error' : ''}`}
          type="email"
          inputMode="email"
          autocomplete="email"
          placeholder={t('pro.emailPlaceholder')}
          value={email}
          aria-invalid={emailError}
          onInput={(e) => {
            setEmail((e.target as HTMLInputElement).value);
            if (emailError) setEmailError(false);
          }}
        />
        {emailError && <div class="hint pro-pay-error">{t('pro.emailRequired')}</div>}
      </div>
      <button
        class={`btn ${!pro && trial.state === 'available' ? 'btn-secondary' : 'btn-primary'} pro-pay-cta`}
        type="button"
        disabled={busy || verifying}
        onClick={() => tryCheckout(plan)}
      >
        {t('pro.continuePay', { price: usd(plan) })}
      </button>
      <p class="pro-soft-note">🔒 {t('pro.securedBy')}</p>
      {!pro && !trialEndedPrompt && <p class="pro-soft-note">{t('pro.demoNote')}</p>}
    </div>
  );
  const payBlock = store === 'web' ? stripeBlock : playBlock;

  return (
    <div class="app-shell">
      <header class="topbar">
        <BackButton fallback="/settings" />
        <h1>{t('pro.title')}</h1>
        {pro && <span class="pro-badge">{t('common.pro')}</span>}
      </header>
      <main class="main settings-main">
        <section
          class={`pro-soft-hero${pro ? ' active' : ''}`}
          aria-label={t('pro.nigeriaPricing')}
        >
          <div class="pro-never-lose">
            <h2 class="pro-never-lose-title">
              <span aria-hidden="true">🛡️ </span>
              {t('pro.neverLoseTitle')}
            </h2>
            <p class="pro-never-lose-body">{t('pro.neverLoseBody')}</p>
          </div>
          <div class="pro-soft-row">
            <div class="pro-soft-avatar" aria-hidden="true">
              {pro ? '✓' : '★'}
            </div>
            <div class="pro-soft-text">
              <div class="pro-soft-kicker">{t('pro.nigeriaPricing')}</div>
              <div class="pro-soft-amount">{t('pro.perMonth')}</div>
              <p class="pro-soft-meta">{t('pro.orYear')}</p>
            </div>
          </div>
          {trial.state === 'active' ? (
            <div class="pro-soft-status pro-trial-status" role="status">
              <span aria-hidden="true">⏳</span>
              <span>
                <strong>{trialLeft}</strong>
                {ent.exp ? t('pro.until', { date: new Date(ent.exp).toLocaleDateString(deviceLocale()) }) : ''}
              </span>
            </div>
          ) : pro ? (
            <div class="pro-soft-status">
              <span aria-hidden="true">✓</span>
              <span>
                {t('pro.youreOnPro')}
                {ent.exp
                  ? t('pro.until', {
                      date: new Date(ent.exp).toLocaleDateString(deviceLocale()),
                    })
                  : ''}
                {ent.source ? ` · ${ent.source}` : ''}
              </span>
            </div>
          ) : null}
        </section>

        {trialEndedPrompt && (
          <section class="card pro-trial-ended" role="alert" aria-labelledby="pro-trial-ended-title">
            <h2 id="pro-trial-ended-title">{t('pro.trialEndedTitle')}</h2>
            <p>{t('pro.trialEndedBody')}</p>
            {payBlock}
          </section>
        )}

        <section class="card pro-soft-card">
          <div class="settings-group-label" style={{ marginTop: 0 }}>
            {t('pro.included')}
          </div>
          <ul class="pro-soft-benefits">
            <li>
              <span class="pro-soft-check" aria-hidden="true">
                ✓
              </span>
              <span>{t('pro.benefitCloud')}</span>
            </li>
            <li>
              <span class="pro-soft-check" aria-hidden="true">
                ✓
              </span>
              <span>{t('pro.benefitCsv')}</span>
            </li>
            <li>
              <span class="pro-soft-check" aria-hidden="true">
                ✓
              </span>
              <span>{t('pro.benefitBadge')}</span>
            </li>
            <li>
              <span class="pro-soft-check" aria-hidden="true">
                ✓
              </span>
              <span>{t('pro.benefitNoNag')}</span>
            </li>
            <li>
              <span class="pro-soft-check" aria-hidden="true">
                ✓
              </span>
              <span>{t('pro.benefitFree')}</span>
            </li>
          </ul>

          {verifying && (
            <p class="pro-pay-status" role="status">
              {t('pro.verifying')}
            </p>
          )}
          {verifyMsg && !verifying && (
            <div
              class={`pro-pay-status ${verifyMsg.kind === 'ok' ? 'ok' : 'error'}`}
              role={verifyMsg.kind === 'ok' ? 'status' : 'alert'}
            >
              <span>{verifyMsg.text}</span>
              {verifyMsg.kind === 'offline' && verifyMsg.ref && (
                <button
                  class="btn btn-secondary"
                  type="button"
                  onClick={() => verifyReference(verifyMsg.ref!)}
                >
                  {t('pro.retryVerify')}
                </button>
              )}
            </div>
          )}

          {!pro && trial.state === 'available' && (
            <button
              class="btn btn-primary"
              type="button"
              disabled={busy || verifying}
              onClick={activateDemo}
            >
              {t('pro.tryFree')}
            </button>
          )}
          {!pro && trial.state === 'available' && <p class="pro-soft-note pro-trial-nocard">{t('pro.trialNoCard')}</p>}
          {!pro && trial.state === 'ended' && <p class="pro-soft-note">{t('pro.trialUsedNote')}</p>}

          {canPay && !trialEndedPrompt && payBlock}
        </section>

        {store === 'web' ? (
          <p class="pro-soft-note pro-manage-billing">
            <a href={STRIPE_BILLING_PORTAL_URL} target="_blank" rel="noopener noreferrer">
              {t('pro.manageBilling')}
            </a>
            <br />
            {t('pro.manageBillingSub')}
          </p>
        ) : (
          ent.source?.startsWith('play') && (
            <p class="pro-soft-note pro-manage-billing">
              <a
                href={`https://play.google.com/store/account/subscriptions?package=app.bashibook.twa&sku=pro_${ent.source === 'play-yearly' ? 'yearly' : 'monthly'}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('pro.playManage')}
              </a>
            </p>
          )
        )}
      </main>
    </div>
  );
}
