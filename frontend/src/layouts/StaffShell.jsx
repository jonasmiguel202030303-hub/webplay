import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import PlatformFooter from '../components/PlatformFooter.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

/** Estrutura comum dos painéis (assinante e master): menu lateral no desktop, gaveta no celular. */
export default function StaffShell({ items, title, headerExtra, banner, homePath }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const doLogout = async () => {
    await logout();
    navigate('/entrar', { replace: true });
  };

  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label={title}>
      {items.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-primary/20 text-fg' : 'text-fg/70 hover:bg-fg/10 hover:text-fg'}`
          }
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{label}</span>
          {badge ? <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-on-button">{badge}</span> : null}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-fg/10 lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="px-4 py-4"><Logo to={homePath} /></div>
          <div className="flex-1 overflow-y-auto">{nav}</div>
          <div className="border-t border-fg/10 p-3 text-xs text-fg/60">
            <p className="truncate font-medium text-fg">{user?.name}</p>
            <p className="truncate">{user?.email}</p>
            <button type="button" onClick={doLogout} className="btn btn-ghost btn-sm mt-2 w-full justify-start">
              <LogOut className="h-4 w-4" aria-hidden /> Sair
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-bg shadow-2xl">
            <div className="flex items-center justify-between px-4 py-4">
              <Logo to={homePath} />
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="rounded-full p-1 hover:bg-fg/10"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            <div className="border-t border-fg/10 p-3">
              <button type="button" onClick={doLogout} className="btn btn-secondary w-full"><LogOut className="h-4 w-4" aria-hidden /> Sair</button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-fg/10 bg-bg/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" className="rounded-lg p-2 hover:bg-fg/10 lg:hidden"><Menu className="h-5 w-5" /></button>
            <span className="text-sm font-semibold text-fg/80">{title}</span>
          </div>
          {headerExtra}
        </header>
        {banner}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6"><Outlet /></main>
        <PlatformFooter />
      </div>
    </div>
  );
}
