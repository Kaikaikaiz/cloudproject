import { useCallback, useEffect, useState } from 'react';

// Each update starts a fresh timer, even when the message text is unchanged.
export function useSuccessMessage(duration = 4000) {
  const [notice, setNotice] = useState(null);
  const showMessage = useCallback((message) => {
    setNotice(message ? { message } : null);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), duration);
    return () => window.clearTimeout(timer);
  }, [notice, duration]);
  return [notice?.message || '', showMessage];
}
