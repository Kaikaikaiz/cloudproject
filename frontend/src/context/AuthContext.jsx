import { createContext, useContext, useEffect, useState } from 'react';
import { api, setSessionToken } from '../lib/api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    if (!user || user.role === 'ADMIN') { setSummary(null); return; }
    let active = true, revision = 0;
    const userId = user.id;
    async function sync() {
      if (document.visibilityState === 'hidden') return;
      const current = ++revision;
      try {
        const data = await api('/dashboard');
        if (active && current === revision) setSummary({ userId, balance: data.walletBalance, unread: data.unreadNotifications });
      } catch { /* Keep the last successful summary during temporary API failures. */ }
    }
    function changed(event) {
      if (event.detail?.path === '/dashboard/notifications/read') {
        revision++;
        setSummary(old => ({ ...old, userId, unread: 0 }));
      } else sync();
    }
    sync();
    const timer = window.setInterval(sync, 30000);
    window.addEventListener('relive:data-changed', changed);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('relive:data-changed', changed);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [user?.id, user?.role]);
  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await api('/auth/me');
      setUser(data.user);
    } catch (err) {
      setUser(null);
      if (err.status !== 401) setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    const expire = () => setUser(null);
    window.addEventListener('relive:unauthorized', expire);
    return () => window.removeEventListener('relive:unauthorized', expire);
  }, []);
  async function authenticate(mode, values) {
    const data = await api('/auth/' + mode, { method: 'POST', body: values });
    setSessionToken(data.token);
    setUser(data.user);
    setError('');
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (err) {
      if (err.status !== 401) throw err;
    }
    setUser(null);
    setSessionToken(null);
  }
  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, error, refresh, authenticate, logout,
        unread: summary?.userId === user?.id ? summary?.unread || 0 : 0,
        walletBalance: summary?.userId === user?.id ? summary?.balance ?? null : null }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}
