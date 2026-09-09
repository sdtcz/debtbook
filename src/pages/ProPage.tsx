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
      <main class="main">
        <div class="card">
          <div class="section-title" style={{ marginTop: 0 }}>
            Pricing (Nigeria)
          </div>
          <p style={{ marginTop: 0, fontSize: '1.15rem', fontWeight: 800 }}>
            ₦1,500/mo &nbsp;or&nbsp; ₦12,000/yr
          </p>
          <p class="muted" style={{ marginTop: 0 }}>
            Paystack preferred for NGN (Stripe optional). Real checkout wires when
            server secrets are set.
          </p>

          <div class="section-title">Pro includes</div>
          <ul class="benefits">
            <li>CSV export of customers, balances &amp; entries</li>
            <li>Pro badge on your shop</li>
            <li>Hide upgrade nag on Home</li>
            <li>Everything in Free (offline ledger, remind, statement, backup, PIN)</li>
          </ul>

          {pro ? (
            <p style={{ fontWeight: 700, color: 'var(--ok)' }}>
              You are on Pro
              {ent.exp
                ? ` until ${new Date(ent.exp).toLocaleDateString('en-NG')}`
                : ''}
              {ent.source ? ` (${ent.source})` : ''}.
            </p>
          ) : (
            <>
              <button
                class="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={activateDemo}
              >
                Activate Pro (demo)
              </button>
              <div class="btn-row">
                <button
                  class="btn btn-secondary"
                  type="button"
                  disabled={busy}
                  onClick={tryCheckout}
                >
                  Upgrade (Paystack/Stripe)
                </button>
              </div>
              <p class="muted" style={{ fontSize: '0.85rem' }}>
                Demo sets plan=pro for 30 days locally — try tonight without payment
                keys. Upgrade calls <code>/api/checkout</code> when configured.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
