import { useEffect } from 'react';
import { useGameStore } from '../state/store';

const AUTO_DISMISS_MS = 3200;

export function Toast() {
  const toast = useGameStore((s) => s.toast);
  const dismissToast = useGameStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" onClick={dismissToast}>
      {toast}
    </div>
  );
}
