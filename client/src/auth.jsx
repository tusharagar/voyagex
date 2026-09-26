/**
 * auth.jsx — session state.
 *
 * Deliberately a small context rather than a state library: the only global
 * state in this application is "who is signed in" (SRS constraint C-05).
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    // A token in storage may be expired or signed with a rotated secret, so it
    // is confirmed against the server before the UI trusts it.
    api.get('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => { setToken(null); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    isStaff: user?.role_name === 'AGENT' || user?.role_name === 'MANAGER',
    async login(email, password) {
      const d = await api.post('/auth/login', { email, password }, { auth: false });
      setToken(d.token);
      const me = await api.get('/auth/me');
      setUser(me.user);
      return d.user;
    },
    async register(payload) {
      const d = await api.post('/auth/register', payload, { auth: false });
      setToken(d.token);
      const me = await api.get('/auth/me');
      setUser(me.user);
      return d;
    },
    logout() { setToken(null); setUser(null); },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
