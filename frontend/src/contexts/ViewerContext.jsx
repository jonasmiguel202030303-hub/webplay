import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { publicService } from '../services/authService.js';
import { createViewerService } from '../services/viewerService.js';
import { applyTheme, resetTheme } from '../utils/theme.js';

const ViewerContext = createContext(null);

const profileKey = (slug) => `wp:${slug}:profile`;

/** Marca (tema white-label) + sessão do espectador + perfil ativo para a página /<slug>. */
export function ViewerProvider({ slug, children }) {
  const [tenant, setTenant] = useState(null);
  const [tenantState, setTenantState] = useState('loading'); // loading | ready | notfound | error
  const [viewer, setViewer] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [account, setAccount] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileId, setProfileId] = useState(() => Number(localStorage.getItem(profileKey(slug))) || null);
  const profileRef = useRef(profileId);
  profileRef.current = profileId;

  const svc = useMemo(() => createViewerService(slug, () => profileRef.current), [slug]);

  // Marca da página
  useEffect(() => {
    let alive = true;
    setTenantState('loading');
    setTenant(null);
    publicService
      .tenant(slug)
      .then((t) => {
        if (!alive) return;
        setTenant(t);
        setTenantState('ready');
      })
      .catch((err) => {
        if (!alive) return;
        setTenantState(err.status === 404 ? 'notfound' : 'error');
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  // Tema, título, ícone e manifest PWA por marca
  useEffect(() => {
    if (!tenant) return undefined;
    const { brand } = tenant;
    applyTheme(brand.colors);
    const prevTitle = document.title;
    document.title = brand.displayName;
    const manifest = document.getElementById('app-manifest');
    const prevManifest = manifest?.getAttribute('href');
    manifest?.setAttribute('href', `/api/public/tenants/${slug}/manifest.webmanifest`);
    const icon = document.querySelector('link[rel="icon"]');
    const prevIcon = icon?.getAttribute('href');
    if (brand.assets.favicon) icon?.setAttribute('href', brand.assets.favicon);
    return () => {
      resetTheme();
      document.title = prevTitle;
      if (prevManifest) manifest?.setAttribute('href', prevManifest);
      if (prevIcon) icon?.setAttribute('href', prevIcon);
    };
  }, [tenant, slug]);

  // Sessão do espectador
  const loadSession = useCallback(async () => {
    try {
      const data = await svc.me();
      setViewer(data.viewer);
      setProfiles(data.profiles);
      setAccount(data.account ?? null);
      return data;
    } catch {
      setViewer(null);
      setProfiles([]);
      setAccount(null);
      return null;
    } finally {
      setSessionLoading(false);
    }
  }, [svc]);

  useEffect(() => {
    const isPublicViewerRoute = ['entrar', 'cadastro', 'esqueci-senha', 'redefinir-senha'].includes(window.location.pathname.split('/').filter(Boolean).at(-1));
    if (isPublicViewerRoute) {
      setViewer(null);
      setProfiles([]);
      setSessionLoading(false);
      return;
    }
    setSessionLoading(true);
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    const onUnauthorized = (e) => {
      if ((e.detail?.path ?? '').startsWith(`/v/${slug}`) && !/\/(line-)?login$/.test(e.detail.path)) {
        setViewer(null);
        setProfiles([]);
      }
    };
    window.addEventListener('wp:unauthorized', onUnauthorized);
    return () => window.removeEventListener('wp:unauthorized', onUnauthorized);
  }, [slug]);

  // Mantém o perfil ativo válido
  useEffect(() => {
    if (!viewer) return;
    if (profileId && !profiles.some((p) => p.id === profileId)) {
      setProfileId(null);
      localStorage.removeItem(profileKey(slug));
    }
  }, [viewer, profiles, profileId, slug]);

  const selectProfile = useCallback(
    (id) => {
      profileRef.current = id;
      setProfileId(id);
      if (id) localStorage.setItem(profileKey(slug), String(id));
      else localStorage.removeItem(profileKey(slug));
    },
    [slug],
  );

  const acceptSession = useCallback((data) => {
    setViewer(data.viewer);
    setProfiles(data.profiles);
    setAccount(data.account ?? null);
    setSessionLoading(false);
    return data;
  }, []);

  const login = useCallback(async (email, password) => acceptSession(await svc.login(email, password)), [svc, acceptSession]);
  const lineLogin = useCallback(async (username, password) => acceptSession(await svc.lineLogin(username, password)), [svc, acceptSession]);
  const register = useCallback(async (data) => acceptSession(await svc.register(data)), [svc, acceptSession]);

  const logout = useCallback(async () => {
    try {
      await svc.logout();
    } finally {
      setViewer(null);
      setProfiles([]);
      setAccount(null);
      selectProfile(null);
    }
  }, [svc, selectProfile]);

  const refreshProfiles = useCallback(async () => {
    const data = await svc.profiles();
    setProfiles(data.profiles);
    return data.profiles;
  }, [svc]);

  const profile = profiles.find((p) => p.id === profileId) ?? null;

  const value = useMemo(
    () => ({
      slug, tenant, tenantState, viewer, profiles, profile, account, sessionLoading, svc,
      login, lineLogin, register, logout, selectProfile, refreshProfiles, loadSession,
    }),
    [slug, tenant, tenantState, viewer, profiles, profile, account, sessionLoading, svc, login, lineLogin, register, logout, selectProfile, refreshProfiles, loadSession],
  );

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer() {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error('useViewer fora do ViewerProvider');
  return ctx;
}
