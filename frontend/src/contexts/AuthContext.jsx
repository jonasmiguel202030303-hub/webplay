import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { authService } from '../services/authService.js';

const AuthContext = createContext(null);

const isPublicAuthRoute = (pathname = '') => {
  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length) return false;
  const last = segments[segments.length - 1];
  const authPages = new Set(['entrar', 'cadastro', 'ativar', 'esqueci-senha', 'redefinir-senha']);
  if (authPages.has(last)) return true;
  const legalPages = new Set(['termos', 'privacidade', 'aviso-legal']);
  if (legalPages.has(last) && (segments.length === 1 || !['master', 'painel'].includes(segments[0]))) return true;
  return false;
};

/** Sessão do painel (assinante, administrador ou master). O cookie é HttpOnly: aqui só há o resumo do usuário. */
export function AuthProvider({ children }) {
  const location = useLocation();
  const [session, setSession] = useState({ user: null, tenant: null, subscription: null });
  const [loading, setLoading] = useState(true);

  const clear = useCallback(() => setSession({ user: null, tenant: null, subscription: null }), []);

  const refresh = useCallback(async () => {
    try {
      const data = await authService.me();
      setSession(data);
      return data;
    } catch {
      clear();
      return null;
    } finally {
      setLoading(false);
    }
  }, [clear]);

  useEffect(() => {
    if (isPublicAuthRoute(location.pathname)) {
      setLoading(false);
      return;
    }
    refresh();
  }, [location.pathname, refresh]);

  useEffect(() => {
    const onUnauthorized = (e) => {
      const p = e.detail?.path ?? '';
      if (p.startsWith('/tenant') || p.startsWith('/master') || p.startsWith('/auth/change')) clear();
    };
    window.addEventListener('wp:unauthorized', onUnauthorized);
    return () => window.removeEventListener('wp:unauthorized', onUnauthorized);
  }, [clear]);

  const login = useCallback(async (email, password) => {
    const data = await authService.login(email, password);
    setSession(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clear();
    }
  }, [clear]);

  const value = useMemo(() => ({ ...session, loading, login, logout, refresh }), [session, loading, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

export const isStaff = (user) => user?.role === 'master' || user?.role === 'admin';
export const homeFor = (user) => (isStaff(user) ? '/master' : '/painel');
