import { useCallback, useEffect, useState } from 'preact/hooks';
import { PinLock } from './components/PinLock';
import { Toast } from './components/Toast';
import { getShop } from './db/repo';
import { useLocale } from './hooks/useLocale';
import { useToast } from './hooks/useToast';
import { initLocale, t as tNow } from './i18n';
import {
  checkPullOnFocus,
  pullAndRestore,
  tryAutoPush,
} from './lib/deviceSync';
import { getUnlockedRecoveryCode } from './lib/syncUnlock';
import { isPayMeHash, parseHash, type Route } from './lib/router';
import {
  clearForceApp,
  isLocalForceApp,
  isPhoneLikeViewport,
  shouldShowApp,
} from './lib/viewportMode';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { CustomerFormPage } from './pages/CustomerFormPage';
import { EntryFormPage } from './pages/EntryFormPage';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { PayDetailsPage } from './pages/PayDetailsPage';
import { PayMePage } from './pages/PayMePage';
import { ProPage } from './pages/ProPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';

function useAppMode(): [boolean, () => void, () => void, boolean] {
  const [showApp, setShowApp] = useState(() => shouldShowApp() || isPayMeHash());
  const [showShowcaseBack, setShowShowcaseBack] = useState(
    () => isLocalForceApp() && !isPhoneLikeViewport(),
  );

  useEffect(() => {
    const recompute = () => {
      setShowApp(shouldShowApp() || isPayMeHash());
      setShowShowcaseBack(isLocalForceApp() && !isPhoneLikeViewport());
    };
    const mqNarrow = window.matchMedia('(max-width: 640px)');
    const mqCoarse = window.matchMedia('(pointer: coarse)');
    const mqMid = window.matchMedia('(max-width: 900px)');
    mqNarrow.addEventListener('change', recompute);
    mqCoarse.addEventListener('change', recompute);
    mqMid.addEventListener('change', recompute);
    window.addEventListener('resize', recompute);
    window.addEventListener('hashchange', recompute);
    return () => {
      mqNarrow.removeEventListener('change', recompute);
      mqCoarse.removeEventListener('change', recompute);
      mqMid.removeEventListener('change', recompute);
      window.removeEventListener('resize', recompute);
      window.removeEventListener('hashchange', recompute);
    };
  }, []);

  const forceApp = useCallback(() => {
    setShowApp(true);
    setShowShowcaseBack(isLocalForceApp() && !isPhoneLikeViewport());
  }, []);

  const backToShowcase = useCallback(() => {
    clearForceApp();
    setShowApp(shouldShowApp() || isPayMeHash());
    setShowShowcaseBack(false);
  }, []);

  return [showApp, forceApp, backToShowcase, showShowcaseBack];
}

export function App() {
  const [showApp, forceApp, backToShowcase, showShowcaseBack] = useAppMode();
  const [route, setRoute] = useState<Route>(parseHash());
  const [ready, setReady] = useState(false);
  const [hasShop, setHasShop] = useState(false);
  const [pinHash, setPinHash] = useState<string | undefined>();
  const [pinSalt, setPinSalt] = useState<string | undefined>();
  const [locked, setLocked] = useState(false);
  const { message, action, toast, clearToast } = useToast();
  const { t } = useLocale();

  const refreshShop = async () => {
    const shop = await getShop();
    if (shop?.locale) initLocale(shop.locale);
    setHasShop(Boolean(shop?.name));
    setPinHash(shop?.pinHash);
    setPinSalt(shop?.pinSalt);
    setReady(true);
  };

  const onPinChanged = useCallback(async () => {
    const shop = await getShop();
    setPinHash(shop?.pinHash);
    setPinSalt(shop?.pinSalt);
    if (!shop?.pinHash) setLocked(false);
  }, []);

  // Always track hash (needed for public #/payme on desktop landing)
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!showApp && route.name !== 'payme') return;
    if (route.name === 'payme') {
      setReady(true);
      return;
    }
    refreshShop();
  }, [showApp, route.name]);

  // Lock when returning to the tab/app if PIN is set (never for public payme)
  useEffect(() => {
    if (!showApp || route.name === 'payme') return;
    const onVis = () => {
      if (document.visibilityState === 'visible' && pinHash && pinSalt) {
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    if (pinHash && pinSalt) setLocked(true);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [showApp, pinHash, pinSalt, route.name]);

  // Multi-device sync: debounced auto-push + pull-offer on focus
  useEffect(() => {
    if (!showApp || route.name === 'payme') return;

    let debounceTimer: number | undefined;
    let cancelled = false;

    const scheduleAutoPush = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void tryAutoPush();
      }, 45_000);
    };

    const onChanged = () => scheduleAutoPush();

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        void tryAutoPush();
        return;
      }
      if (document.visibilityState !== 'visible' || cancelled) return;
      void (async () => {
        const offer = await checkPullOnFocus();
        if (cancelled || offer.kind !== 'offer_restore') return;
        const ok = confirm(tNow('settings.syncPullConfirm'));
        if (!ok || cancelled) return;
        try {
          const shop = await getShop();
          const code = shop?.cloudBackupId
            ? await getUnlockedRecoveryCode(shop.cloudBackupId)
            : undefined;
          if (!code) return;
          const result = await pullAndRestore(code);
          if (cancelled) return;
          toast(
            tNow('settings.syncRestored', {
              customers: result.customers,
              entries: result.entries,
            }),
          );
          window.dispatchEvent(new Event('debtbook:changed'));
        } catch {
          /* soft fail — no modal spam */
        }
      })();
    };

    const onOnline = () => {
      void tryAutoPush();
    };

    window.addEventListener('debtbook:changed', onChanged);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);

    // Initial focus check shortly after mount
    const boot = window.setTimeout(() => onVis(), 1500);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceTimer);
      window.clearTimeout(boot);
      window.removeEventListener('debtbook:changed', onChanged);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
    };
  }, [showApp, route.name, toast]);

  // Public Pay-me page — no PIN, works for customers (incl. desktop)
  if (route.name === 'payme') {
    return (
      <>
        <PayMePage route={route} toast={(msg) => toast(msg)} />
        <Toast message={message} action={action} onDismiss={clearToast} />
      </>
    );
  }

  if (!showApp) {
    return <LandingPage onUseAppHere={forceApp} />;
  }

  const showcaseBtn = showShowcaseBack ? (
    <button type="button" class="showcase-back-btn" onClick={backToShowcase}>
      ← Showcase home
    </button>
  ) : null;

  if (!ready) {
    return (
      <>
        {showcaseBtn}
        <div class="setup-screen">
          <h1>BashiBook</h1>
          <p>{t('common.loading')}</p>
        </div>
      </>
    );
  }

  if (!hasShop || route.name === 'setup') {
    return (
      <>
        {showcaseBtn}
        <SetupPage
          onDone={() => {
            setHasShop(true);
          }}
        />
        <Toast message={message} action={action} onDismiss={clearToast} />
      </>
    );
  }

  let page;
  switch (route.name) {
    case 'customer-new':
      page = <CustomerFormPage toast={toast} />;
      break;
    case 'customer-edit':
      page = <CustomerFormPage id={route.id} toast={toast} />;
      break;
    case 'customer':
      page = <CustomerDetailPage id={route.id} toast={toast} />;
      break;
    case 'entry-new':
      page = (
        <EntryFormPage
          customerId={route.id}
          initialType={route.type}
          toast={toast}
        />
      );
      break;
    case 'settings':
      page = <SettingsPage toast={toast} onPinChanged={onPinChanged} />;
      break;
    case 'pro':
      page = <ProPage toast={toast} />;
      break;
    case 'pay-details':
      page = <PayDetailsPage toast={toast} />;
      break;
    default:
      page = <HomePage locked={locked} toast={toast} />;
  }

  return (
    <>
      {showcaseBtn}
      {page}
      {locked && pinHash && pinSalt && (
        <PinLock
          salt={pinSalt}
          hash={pinHash}
          onUnlock={() => setLocked(false)}
        />
      )}
      <Toast message={message} action={action} onDismiss={clearToast} />
    </>
  );
}
