import { useCallback, useRef, useState } from 'preact/hooks';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastState {
  message: string;
  action?: ToastAction;
}

export function useToast(defaultMs = 2200) {
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    setToastState(null);
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const toast = useCallback(
    (msg: string, opts?: { ms?: number; action?: ToastAction }) => {
      setToastState({ message: msg, action: opts?.action });
      if (timer.current) window.clearTimeout(timer.current);
      const ms = opts?.ms ?? (opts?.action ? 10000 : defaultMs);
      timer.current = window.setTimeout(() => setToastState(null), ms);
    },
    [defaultMs],
  );

  return {
    message: toastState?.message ?? null,
    action: toastState?.action,
    toast,
    clearToast: clear,
  };
}
