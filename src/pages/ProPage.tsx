import { useEffect, useState } from 'preact/hooks';
import { notifyChanged } from '../components/StatusBadge';
import { getShop, setEntitlement } from '../db/repo';
import { demoProEntitlement, getEntitlement, isPro } from '../lib/entitlement';
import type { ShopProfile } from '../lib/types';
import { navigate } from '../lib/router';
import type { ToastAction } from '../hooks/useToast';

interface Props {
  toast: (msg: string, opts?: { ms?: number; action?: ToastAction }) => void;
}

export function ProPage({ toast }: Props) {
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
      await setEntitlement(demoProEntitlement(30));
      notifyChanged();
      await refresh();
      toast('Pro activated for 30 days (demo)');
    } finally {
      setBusy(false);
    }
  };

  const tryCheckout = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(
          (body as { message?: string }).message ||
            'Checkout not configured — use Activate Pro (demo)',
        );
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast('No checkout URL — use demo activation');
      }
    } catch {
      toast('Checkout unavailable — use Activate Pro (demo)');
    } finally {
      setBusy(false);
    }
  };

  const ent = getEntitlement(shop);
  const pro = isPro(shop);

  return (
    <div class="app-shell">
      <header class="topbar">
        <button
          class="icon-btn"
          type="button"
          aria-label="Back"
          onClick={() => navigate('/settings')}
        >
          ←
        </button>
        <h1>DebtBook Pro</h1>
        {pro && <span class="pro-badge">Pro</span>}
      </header>
      <main class="main settings-main">
        <section class="card">
          <div class="settings-group-label" style={{ marginTop: 0 }}>
            Nigeria pricing
          </div>
          <p class="pro-hero-price">₦1,500/mo</p>
          <p class="muted" style={{ marginTop: 0, marginBottom: 12 }}>
            or ₦12,000/year · Paystack when checkout is live
          </p>

          {pro ? (
            <div class="pro-status">
              <span aria-hidden="true">✓</span>
              <span>
                You’re on Pro
                {ent.exp
                  ? ` until ${new Date(ent.exp).toLocaleDateString('en-NG')}`
                  : ''}
                {ent.source ? ` · ${ent.source}` : ''}
              </span>
            </div>
          ) : null}

          <div class="settings-group-label">Included</div>
          <ul class="benefits">
            <li>Encrypted cloud backup + multi-device restore (recovery code)</li>
            <li>CSV export of customers, balances &amp; entries</li>
            <li>Pro badge on your shop</li>
            <li>No upgrade nag on Home</li>
            <li>
              Free still includes the offline ledger, remind, statement, local
              JSON backup, and PIN
            </li>
          </ul>

          {!pro && (
            <>
              <button
                class="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={activateDemo}
              >
                Try Pro free for 30 days
              </button>
              <div class="btn-row">
                <button
                  class="btn btn-secondary"
                  type="button"
                  disabled={busy}
                  onClick={tryCheckout}
                >
                  Pay with Paystack
                </button>
              </div>
              <p class="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
                Demo unlocks Pro on this phone only. Real Paystack checkout turns
                on when server keys are set.
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
