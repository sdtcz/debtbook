import { useCallback, useRef, useState } from 'preact/hooks';

export function useToast(ms = 2200) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const toast = useCallback(
    (msg: string) => {
      setMessage(msg);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(null), ms);
    },
    [ms],
  );

  return { message, toast };
}
