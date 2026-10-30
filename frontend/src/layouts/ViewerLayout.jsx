import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Clock, Heart, Home, LogOut, Search, Tv, User, Users, Film, Clapperboard, Volume2, VolumeX } from 'lucide-react';
import BrandLogo from '../components/viewer/BrandLogo.jsx';
import ProfileAvatar from '../components/viewer/ProfileAvatar.jsx';
import { ContentModalProvider } from '../components/viewer/ContentModal.jsx';
import WhatsAppFloat from '../components/WhatsAppFloat.jsx';
import { setSoundEnabled, playPreview, useSoundEnabled } from '../utils/sound.js';
import { useViewer } from '../contexts/ViewerContext.jsx';

const NAV = [
  { to: '', label: 'Início', icon: Home, end: true },
  { to: 'canais', label: 'Canais', icon: Tv },
  { to: 'filmes', label: 'Filmes', icon: Film },
  { to: 'series', label: 'Séries', icon: Clapperboard },
  { to: 'favoritos', label: 'Favoritos', icon: Heart },
  { to: 'buscar', label: 'Buscar', icon: Search, mobileOnly: true },
  { to: 'historico', label: 'Histórico', icon: Clock, desktopOnly: true },
];

function ProfileMenu() {
  const { slug, profile, viewer, logout } = useViewer();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const soundOn = useSoundEnabled();
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  const item = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fg/80 hover:bg-fg/10 hover:text-fg';
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Menu do perfil" className="flex items-center gap-2 rounded-lg p-1 hover:bg-fg/10">
        <ProfileAvatar name={profile.name} avatar={profile.avatar} size="sm" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-56 animate-fade-in rounded-xl border border-fg/15 bg-bg p-1.5 shadow-2xl">
          <div className="border-b border-fg/10 px-3 py-2">
            <p className="truncate text-sm font-semibold">{profile.name}</p>
            <p className="truncate text-xs text-fg/50">{viewer.email}</p>
          </div>
          <button type="button" role="menuitem" className={item} onClick={() => go(`/${slug}/perfis`)}><Users className="h-4 w-4" /> Trocar perfil</button>
          <button type="button" role="menuitem" className={item} onClick={() => go(`/${slug}/historico`)}><Clock className="h-4 w-4" /> Histórico</button>
          <button type="button" role="menuitem" className={item} onClick={() => go(`/${slug}/conta`)}><User className="h-4 w-4" /> Minha conta</button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={soundOn}
            className={item}
            onClick={() => {
              setSoundEnabled(!soundOn);
              if (!soundOn) playPreview();
            }}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} Som: {soundOn ? 'ligado' : 'desligado'}
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${item} text-red-300 hover:text-red-200`}
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate(`/${slug}/entrar`, { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

function SearchBox() {
  const { slug } = useViewer();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length >= 2) navigate(`/${slug}/buscar?q=${encodeURIComponent(q.trim())}`);
      }}
      className="relative hidden md:block"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg/40" aria-hidden />
      <input className="input w-56 pl-9" type="search" placeholder="Buscar canais, filmes e séries" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}

/** Estrutura da área do espectador: cabeçalho com menu (desktop), barra inferior (celular) e rodapé da marca. */
export default function ViewerLayout() {
  const { slug, tenant } = useViewer();
  const { brand } = tenant;
  const { pathname } = useLocation();
  const base = `/${slug}`;
  const watching = pathname.startsWith(`${base}/assistir/`);
  const isHome = pathname === base || pathname === `${base}/`;
  const [scrolled, setScrolled] = useState(!isHome);

  useEffect(() => {
    if (!isHome) {
      setScrolled(true);
      return undefined;
    }
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  return (
    <ContentModalProvider>
    <div className="flex min-h-screen flex-col pb-16 md:pb-0">
      <header className={`sticky top-0 z-30 transition-colors duration-300 ${scrolled ? 'border-b border-fg/10 bg-bg/90 backdrop-blur' : 'border-b border-transparent bg-gradient-to-b from-black/70 to-transparent'}`}>
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <Link to={base} aria-label={`Início de ${brand.displayName}`}><BrandLogo /></Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Principal">
            {NAV.filter((n) => !n.mobileOnly).map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to ? `${base}/${to}` : base}
                end={end}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-fg/10 text-fg' : 'text-fg/60 hover:text-fg'}`}
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <SearchBox />
            <ProfileMenu />
          </div>
        </div>
      </header>

      {brand.notice && !watching && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-100" role="status">{brand.notice}</div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1"><Outlet /></main>

      <footer className="border-t border-fg/10 px-4 py-6 text-center text-xs text-fg/50">
        <p>{brand.footerText || brand.displayName}</p>
        <nav className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1" aria-label="Documentos legais">
          <Link to="/termos" className="hover:text-fg">Termos de Uso</Link>
          <Link to="/privacidade" className="hover:text-fg">Política de Privacidade</Link>
          <Link to={`${base}/conta`} className="hover:text-fg">Meus dados</Link>
        </nav>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-fg/10 bg-bg/95 backdrop-blur md:hidden" aria-label="Navegação inferior">
        {NAV.filter((n) => !n.desktopOnly).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to ? `${base}/${to}` : base}
            end={end}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-primary' : 'text-fg/60'}`}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      {!watching && <WhatsAppFloat phone={brand.whatsapp} message={`Olá! Preciso de ajuda com ${brand.displayName}.`} className="bottom-20 right-4 md:bottom-6 md:right-6" />}
    </div>
    </ContentModalProvider>
  );
}
