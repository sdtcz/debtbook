import { useCallback, useEffect, useState } from 'preact/hooks';
import { PinLock } from './components/PinLock';
import { Toast } from './components/Toast';
import { getShop } from './db/repo';
import { useLocale } from './hooks/useLocale';
import { useToast } from './hooks/useToast';
import { initLocale } from './i18n';
import { parseHash, type Route } from './lib/router';
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
import { ProPage } from './pages/ProPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';

function useAppMode(): [boolean, () => void, () => void, boolean] {
  const [showApp, setShowApp] = useState(() => shouldShowApp());
  const [showShowcaseBack, setShowShowcaseBack] = useState(
    () => isLocalForceApp() && !isPhoneLikeViewport(),
  );

  useEffect(() => {
    const recompute = () => {
      setShowApp(shouldShowApp());
      setShowShowcaseBack(isLocalForceApp() && !isPhoneLikeViewport());
    };
    const mqNarrow = window.matchMedia('(max-width: 640px)');
    const mqCoarse = window.matchMedia('(pointer: coarse)');
    const mqMid = window.matchMedia('(max-width: 900px)');
    mqNarrow.addEventListener('change', recompute);
    mqCoarse.addEventListener('change', recompute);
    mqMid.addEventListener('change', recompute);
    window.addEventListener('resize', recompute);
    return () => {
      mqNarrow.removeEventListener('change', recompute);
      mqCoarse.removeEventListener('change', recompute);
      mqMid.removeEventListener('change', recompute);
      window.removeEventListener('resize', recompute);
    };
  }, []);

  const forceApp = useCallback(() => {
    setShowApp(true);
    setShowShowcaseBack(isLocalForceApp() && !isPhoneLikeViewport());
  }, []);

  const backToShowcase = useCallback(() => {
    clearForceApp();
    setShowApp(shouldShowApp());
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

  useEffect(() => {
    if (!showApp) return;
    refreshShop();
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [showApp]);

  // Lock when returning to the tab/app if PIN is set
  useEffect(() => {
    if (!showApp) return;
    const onVis = () => {
      if (document.visibilityState === 'visible' && pinHash && pinSalt) {
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    // Also lock on first load if PIN exists
    if (pinHash && pinSalt) setLocked(true);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [showApp, pinHash, pinSalt]);

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
    default:
      page = <HomePage locked={locked} />;
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
