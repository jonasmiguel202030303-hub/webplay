import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import PublicFooter from '../components/PublicFooter.jsx';
import { useAuth, homeFor } from '../contexts/AuthContext.jsx';

const NAV = [
  { to: '/#para-quem', label: 'Para quem' },
  { to: '/#recursos', label: 'Recursos' },
  { to: '/#como-funciona', label: 'Como funciona' },
  { to: '/#planos', label: 'Planos' },
];

export default function PublicLayout() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname, location.hash, location.key]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const logged = !loading && user;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-button focus:px-4 focus:py-2 focus:text-on-button">
        Ir para o conteúdo
      </a>
      <header className="sticky top-0 z-40 border-b border-fg/10 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Seções do site">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="rounded-lg px-3 py-2 text-sm text-fg/70 transition hover:bg-fg/10 hover:text-fg">{n.label}</Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {logged ? (
              <Link to={homeFor(user)} className="btn btn-primary btn-sm">Abrir painel</Link>
            ) : (
              <>
                <Link to="/entrar" className="btn btn-ghost btn-sm">Entrar</Link>
                <Link to="/cadastro" className="btn btn-primary btn-sm btn-glow">Criar conta</Link>
              </>
            )}
          </div>
          <button
            type="button"
            className="btn btn-icon btn-ghost md:hidden"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            aria-controls="menu-mobile"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>

        {open && (
          <div id="menu-mobile" className="animate-fade-in border-t border-fg/10 bg-bg/95 px-4 pb-5 pt-3 md:hidden">
            <nav className="flex flex-col" aria-label="Menu mobile">
              {NAV.map((n) => (
                <Link key={n.to} to={n.to} className="rounded-lg px-3 py-3 text-base text-fg/85 hover:bg-fg/10">{n.label}</Link>
              ))}
            </nav>
            <div className="mt-3 grid gap-2">
              {logged ? (
                <Link to={homeFor(user)} className="btn btn-primary">Abrir painel</Link>
              ) : (
                <>
                  <Link to="/cadastro" className="btn btn-primary">Criar conta</Link>
                  <Link to="/entrar" className="btn btn-secondary">Entrar</Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>
      <main id="conteudo" className="flex-1"><Outlet /></main>
      <PublicFooter />
    </div>
  );
}
