import { useEffect, useState } from 'preact/hooks';
import { verifyPin } from '../lib/pin';

interface Props {
  salt: string;
  hash: string;
  onUnlock: () => void;
}

export function PinLock({ salt, hash, onUnlock }: Props) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (digits.length !== 4) return;
    let cancelled = false;
    (async () => {
      const ok = await verifyPin(salt, digits, hash);
      if (cancelled) return;
      if (ok) {
        setError(false);
        onUnlock();
      } else {
        setError(true);
        setDigits('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [digits, salt, hash, onUnlock]);

  const press = (d: string) => {
    setError(false);
    setDigits((prev) => (prev.length < 4 ? prev + d : prev));
  };

  const back = () => setDigits((prev) => prev.slice(0, -1));

  return (
    <div class="pin-overlay" role="dialog" aria-modal="true" aria-label="Unlock DebtBook">
      <div class="pin-card">
        <h2>Unlock DebtBook</h2>
        <p class="muted" style={{ margin: 0 }}>
          Enter your 4-digit PIN
        </p>
        <div class="pin-dots" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} class={digits.length > i ? 'filled' : ''} />
          ))}
        </div>
        {error && (
          <p style={{ color: 'var(--danger)', margin: '0 0 10px', fontWeight: 700 }}>
            Wrong PIN
          </p>
        )}
        <div class="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) =>
            k === '' ? (
              <span key="empty" />
            ) : (
              <button
                key={k}
                type="button"
                onClick={() => (k === '⌫' ? back() : press(k))}
                aria-label={k === '⌫' ? 'Backspace' : k}
              >
                {k}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
