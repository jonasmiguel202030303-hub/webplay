import { Activity, CreditCard, FileText, KeyRound, LayoutDashboard, LifeBuoy, ScrollText, Settings, ShieldCheck, Users, Webhook } from 'lucide-react';
import StaffShell from './StaffShell.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

const ITEMS = [
  { to: '/master', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/master/assinantes', label: 'Assinantes', icon: Users },
  { to: '/master/configuracoes', label: 'Configurações comerciais', icon: Settings, master: true },
  { to: '/master/mercado-pago', label: 'Mercado Pago', icon: CreditCard, master: true },
  { to: '/master/pagamentos', label: 'Pagamentos e webhooks', icon: Webhook },
  { to: '/master/termos', label: 'Termos e privacidade', icon: FileText },
  { to: '/master/suporte', label: 'Suporte e LGPD', icon: LifeBuoy },
  { to: '/master/auditoria', label: 'Auditoria', icon: ScrollText },
  { to: '/master/administradores', label: 'Administradores', icon: KeyRound, master: true },
  { to: '/master/sistema', label: 'Sistema', icon: Activity },
];

export default function MasterLayout() {
  const { user } = useAuth();
  const items = ITEMS.filter((i) => !i.master || user?.role === 'master');
  return (
    <StaffShell
      items={items}
      title={user?.role === 'master' ? 'Administração master' : 'Administração'}
      homePath="/master"
      headerExtra={<span className="hidden items-center gap-1 text-xs text-fg/60 sm:flex"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden />{user?.role === 'master' ? 'Master' : 'Administrador'}</span>}
    />
  );
}
