import { useEffect, useState } from 'preact/hooks';
import { Toast } from './components/Toast';
import { getShop } from './db/repo';
import { useToast } from './hooks/useToast';
import { parseHash, type Route } from './lib/router';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { CustomerFormPage } from './pages/CustomerFormPage';
import { EntryFormPage } from './pages/EntryFormPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';

export function App() {
  const [route, setRoute] = useState<Route>(parseHash());
  const [ready, setReady] = useState(false);
  const [hasShop, setHasShop] = useState(false);
  const { message, toast } = useToast();

  const refreshShop = async () => {
    const shop = await getShop();
    setHasShop(Boolean(shop?.name));
    setReady(true);
  };

  useEffect(() => {
    refreshShop();
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!ready) {
    return (
      <div class="setup-screen">
        <h1>DebtBook</h1>
        <p>Loading…</p>
      </div>
    );
  }

  if (!hasShop || route.name === 'setup') {
    return (
      <>
        <SetupPage
          onDone={() => {
            setHasShop(true);
          }}
        />
        <Toast message={message} />
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
      page = <SettingsPage toast={toast} />;
      break;
    default:
      page = <HomePage />;
  }

  return (
    <>
      {page}
      <Toast message={message} />
    </>
  );
}
