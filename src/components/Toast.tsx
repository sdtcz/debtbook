export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <div class="toast" role="status">{message}</div>;
}
