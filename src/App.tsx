import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { PinLock } from './components/PinLock';
import { showsTabBar, TabBar } from './components/TabBar';
import { Toast } from './components/Toast';
import { getShop } from './db/repo';
import { reconcileTrialOnStart } from './lib/trialStore';
import { useLocale } from './hooks/useLocale';
import { useToast } from './hooks/useToast';
import { initLocale, t as tNow } from './i18n';
import {
  checkPullOnFocus,
  pullAndRestore,
  tryAutoPush,
} from './lib/deviceSync';
import { getUnlockedRecoveryCode } from './lib/syncUnlock';
import { isPayMeHash, navigate, parseHash, type Route } from './lib/router';
import { guardDelete } from './lib/pinGuard';
import { isSignedOut, signIn, signOutAndErase } from './lib/session';
import type { ComponentChildren } from 'preact';
import {
  clearForceApp,
  isEmbeddedFrame,
  isPhoneLikeViewport,
  shouldShowApp,
} from './lib/viewportMode';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { CustomerFormPage } from './pages/CustomerFormPage';
import { EntryFormPage } from './pages/EntryFormPage';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { lazyPage } from './components/LazyPage';

const PayDetailsPage = lazyPage(() => import('./pages/PayDetailsPage').then((m) => m.PayDetailsPage));
const PosterPage = lazyPage(() => import('./pages/PosterPage').then((m) => m.PosterPage));
const PrivacyPage = lazyPage(() => import('./pages/PrivacyPage').then((m) => m.PrivacyPage));
const ProPage = lazyPage(() => import('./pages/ProPage').then((m) => m.ProPage));
const ReportsPage = lazyPage(() => import('./pages/ReportsPage').then((m) => m.ReportsPage));
const SettingsPage = lazyPage(() => import('./pages/SettingsPage').then((m) => m.SettingsPage));
const SuppliersPage = lazyPage(() => import('./pages/suppliers/SupplierPages').then((m) => m.SuppliersPage));
const SupplierFormPage = lazyPage(() => import('./pages/suppliers/SupplierPages').then((m) => m.SupplierFormPage));
const SupplierDetailPage = lazyPage(() => import('./pages/suppliers/SupplierPages').then((m) => m.SupplierDetailPage));
const SupplierEntryPage = lazyPage(() => import('./pages/suppliers/SupplierPages').then((m) => m.SupplierEntryPage));
import { PayMePage } from './pages/PayMePage';
import { SignedOutPage } from './pages/SignedOutPage';
import { SetupPage } from './pages/SetupPage';

function useDesktopAppStage(showApp: boolean): boolean {
  const [on, setOn] = useState(
    () => showApp && !isPhoneLikeViewport() && !isEmbeddedFrame(),
  );
  useEffect(() => {
    const recompute = () => {
      setOn(showApp && !isPhoneLikeViewport() && !isEmbeddedFrame());
    };
    recompute();
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
  }, [showApp]);
  return on;
}

function DesktopAppStage({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ComponentChildren;
}) {
  return (
    <div class="desktop-app-stage">
      <div class="desktop-app-bg" aria-hidden="true">
        <div class="landing-orb landing-orb-a" />
        <div class="landing-orb landing-orb-b" />
        <div class="landing-orb landing-orb-c" />
        <div class="landing-grid" />
        <div class="landing-noise" />
        <div class="landing-naira-wm">₦</div>
      </div>
      <button type="button" class="showcase-back-btn" onClick={onBack}>
        ← Showcase home
      </button>
      <div class="desktop-app-meta">Live app · phone preview</div>
      <div class="desktop-app-phone">
        <div class="phone-notch" aria-hidden="true" />
        <div class="desktop-app-screen">{children}</div>
      </div>
      <div class="desktop-app-caption">Best on your phone · framed here for desktop</div>
    </div>
  );
}

function useAppMode(): [boolean, () => void, () => void] {
  const [showApp, setShowApp] = useState(() => shouldShowApp() || isPayMeHash());

  useEffect(() => {
    const recompute = () => {
      setShowApp(shouldShowApp() || isPayMeHash());
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
  }, []);

  const backToShowcase = useCallback(() => {
    clearForceApp();
    setShowApp(shouldShowApp() || isPayMeHash());
  }, []);

  return [showApp, forceApp, backToShowcase];
}

export function App() {
  const [showApp, forceApp, backToShowcase] = useAppMode();
  const desktopStage = useDesktopAppStage(showApp);
  const [route, setRoute] = useState<Route>(parseHash());
  const [ready, setReady] = useState(false);
  const [hasShop, setHasShop] = useState(false);
  const [pinHash, setPinHash] = useState<string | undefined>();
  const [pinSalt, setPinSalt] = useState<string | undefined>();
  const [shopName, setShopName] = useState<string | undefined>();
  const [locked, setLocked] = useState(false);
  const startLockDone = useRef(false);
  const [signedOut, setSignedOut] = useState(() => isSignedOut());
  const { message, action, toast, clearToast } = useToast();
  const { t } = useLocale();

  const refreshShop = async () => {
    // Enforce the once-per-install 5-day trial (and cap old 30-day trials) before anything reads Pro.
    await reconcileTrialOnStart().catch(() => null);
    const shop = await getShop();
    if (shop?.locale) initLocale(shop.locale);
    setHasShop(Boolean(shop?.name));
    setShopName(shop?.name);
    setPinHash(shop?.pinHash);
    setPinSalt(shop?.pinSalt);
    setReady(true);
  };

  const onPinChanged = useCallback(async () => {
    const shop = await getShop();
    setShopName(shop?.name);
    setPinHash(shop?.pinHash);
    setPinSalt(shop?.pinSalt);
    if (!shop?.pinHash) setLocked(false);
  }, []);

  const tabbarOn =
    showApp && ready && hasShop && !signedOut && route.name !== 'payme' && showsTabBar(route);
  useEffect(() => {
    document.body.classList.toggle('has-tabbar', tabbarOn);
  }, [tabbarOn]);

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
    if (!showApp || route.name === 'payme' || signedOut) return;
    const onVis = () => {
      if (document.visibilityState === 'visible' && pinHash && pinSalt) {
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    // Lock once when the app opens (or a PIN is first set) — not on every
    // route change, which used to re-ask for the PIN on each tab tap.
    if (pinHash && pinSalt && !startLockDone.current) {
      startLockDone.current = true;
      setLocked(true);
    }
    if (!pinHash) startLockDone.current = false;
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [showApp, pinHash, pinSalt, route.name, signedOut]);

  // Multi-device sync: debounced auto-push + pull-offer on focus
  useEffect(() => {
    if (!showApp || route.name === 'payme' || signedOut) return;

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
  }, [showApp, route.name, toast, signedOut]);

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

  const frame = (node: ComponentChildren) =>
    desktopStage ? (
      <DesktopAppStage onBack={backToShowcase}>{node}</DesktopAppStage>
    ) : (
      node
    );

  if (!ready) {
    return frame(
      <div class="setup-screen">
        <h1>BashiBook</h1>
        <p>{t('common.loading')}</p>
      </div>,
    );
  }

  if (!hasShop || route.name === 'setup') {
    return (
      <>
        {frame(
          <SetupPage
            onDone={() => {
              setHasShop(true);
            }}
          />,
        )}
        <Toast message={message} action={action} onDismiss={clearToast} />
      </>
    );
  }

  const eraseDevice = async () => {
    await signOutAndErase();
    try {
      history.replaceState(null, '', `${location.pathname}${location.search}#/`);
    } catch {
      /* ignore */
    }
    location.reload();
  };

  if (signedOut) {
    return (
      <>
        {frame(
          <SignedOutPage
            shopName={shopName || 'BashiBook'}
            onSignIn={() => {
              signIn();
              setSignedOut(false);
              if (pinHash && pinSalt) setLocked(true);
              navigate('/', { replace: true });
            }}
            onErase={() => {
              if (!confirm(tNow('logout.eraseConfirm'))) return;
              void (async () => {
                if (!(await guardDelete(getShop))) return;
                await eraseDevice();
              })();
            }}
          />,
        )}
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
      page = (
        <SettingsPage
          toast={toast}
          onPinChanged={onPinChanged}
          onLoggedOut={(mode) => {
            if (mode === 'erase') {
              try {
                history.replaceState(null, '', `${location.pathname}${location.search}#/`);
              } catch {
                /* ignore */
              }
              location.reload();
              return;
            }
            setLocked(false);
            setSignedOut(true);
            navigate('/', { replace: true });
          }}
        />
      );
      break;
    case 'pro':
      page = <ProPage toast={toast} />;
      break;
    case 'pay-details':
      page = <PayDetailsPage toast={toast} />;
      break;
    case 'poster':
      page = <PosterPage />;
      break;
    case 'suppliers':
      page = <SuppliersPage />;
      break;
    case 'supplier-new':
      page = <SupplierFormPage toast={toast} />;
      break;
    case 'supplier-edit':
      page = <SupplierFormPage key={`se-${route.id}`} id={route.id} toast={toast} />;
      break;
    case 'supplier':
      page = <SupplierDetailPage key={`s-${route.id}`} id={route.id} toast={toast} />;
      break;
    case 'supplier-entry':
      page = <SupplierEntryPage key={`sen-${route.id}`} supplierId={route.id} initialType={route.type} toast={toast} />;
      break;
    case 'privacy':
      page = <PrivacyPage />;
      break;
    case 'reports':
      page = <ReportsPage locked={locked} toast={toast} />;
      break;
    default:
      page = <HomePage locked={locked} toast={toast} />;
  }

  const tabbed = showsTabBar(route);
  return (
    <>
      {frame(
        tabbed ? (
          <div class="tabbed">
            {page}
            <TabBar route={route} />
          </div>
        ) : (
          page
        ),
      )}
      {locked && pinHash && pinSalt && (
        <PinLock
          salt={pinSalt}
          hash={pinHash}
          shopName={shopName}
          onUnlock={() => setLocked(false)}
        />
      )}
      <Toast message={message} action={action} onDismiss={clearToast} />
    </>
  );
}
