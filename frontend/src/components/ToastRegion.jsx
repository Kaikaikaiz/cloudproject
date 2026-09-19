import { useEffect, useState } from 'react';

export default function ToastRegion() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const add = (event) => {
      const toast = { id: crypto.randomUUID(), message: event.detail?.message || 'Saved.' };
      setToasts((current) => [...current, toast]);
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 4000);
    };
    window.addEventListener('relive:toast', add);
    return () => window.removeEventListener('relive:toast', add);
  }, []);
  return <div className="toast-region" aria-live="polite">{toasts.map((toast) => <p key={toast.id} className="toast">{toast.message}</p>)}</div>;
}
