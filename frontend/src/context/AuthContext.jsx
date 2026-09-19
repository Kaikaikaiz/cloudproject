import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  }
  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, error, refresh, authenticate, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}
