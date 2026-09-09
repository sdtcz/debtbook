import type { ToastAction } from '../hooks/useToast';

interface Props {
  message: string | null;
  action?: ToastAction;
  onDismiss?: () => void;
}

export function Toast({ message, action, onDismiss }: Props) {
  if (!message) return null;
  return (
    <div class="toast" role="status">
      <span class="toast-msg">{message}</span>
      {action && (
        <button
          type="button"
          class="toast-action"
          onClick={() => {
            action.onClick();
            onDismiss?.();
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
