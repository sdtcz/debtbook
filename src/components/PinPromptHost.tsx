import { useEffect, useState } from 'preact/hooks';
import { useLocale } from '../hooks/useLocale';
import { subscribePinRequests, type PinRequest } from '../lib/pinGuard';
import { PinLock } from './PinLock';

/** Mounted once (main.tsx). Shows the PIN pad for guardDelete(). */
export function PinPromptHost() {
  const { t } = useLocale();
  const [req, setReq] = useState<PinRequest | null>(null);
  useEffect(() => subscribePinRequests(setReq), []);
  if (!req) return null;
  return (
    <div class="pin-prompt-host">
      <PinLock
        salt={req.salt}
        hash={req.hash}
        title={t('pin.deleteTitle')}
        hint={t('pin.deleteHint')}
        onUnlock={() => req.resolve(true)}
        onCancel={() => req.resolve(false)}
      />
    </div>
  );
}
