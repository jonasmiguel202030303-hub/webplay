import { ExternalLink, Palette, CreditCard, HelpCircle, LayoutDashboard, MonitorPlay, Receipt, Server, FileText, Sliders } from 'lucide-react';
import StaffShell from './StaffShell.jsx';
import NotificationsBell from '../components/NotificationsBell.jsx';
import SubscriptionBanner from '../components/SubscriptionBanner.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import WhatsAppFloat from '../components/WhatsAppFloat.jsx';
import { usePlatform } from '../hooks/usePlatform.js';

const ITEMS = [
  { to: '/painel', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/painel/marca', label: 'Marca', icon: Palette },
  { to: '/painel/personalizacao', label: 'Personalização', icon: Sliders },
  { to: '/painel/servidores', label: 'Servidores', icon: Server },
  { to: '/painel/player', label: 'Player', icon: MonitorPlay },
  { to: '/painel/assinatura', label: 'Assinatura', icon: CreditCard },
  { to: '/painel/pagamentos', label: 'Pagamentos', icon: Receipt },
  { to: '/painel/ajuda', label: 'Ajuda e suporte', icon: HelpCircle },
  { to: '/painel/termos', label: 'Termos e privacidade', icon: FileText },
];

export default function PanelLayout() {
  const { tenant } = useAuth();
  const platform = usePlatform();
  return (
    <>
    <StaffShell
      items={ITEMS}
      title={tenant?.displayName ?? 'Painel'}
      homePath="/painel"
      banner={<SubscriptionBanner />}
      headerExtra={
        <div className="flex items-center gap-1">
          {tenant && (
            <a href={`/${tenant.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
              <ExternalLink className="h-4 w-4" aria-hidden /> Ver minha página
            </a>
          )}
          <NotificationsBell />
        </div>
      }
    />
    <WhatsAppFloat phone={platform?.supportWhatsapp} message="Olá! Sou cliente do WebPlay Brasil e preciso de ajuda." className="bottom-5 right-5 print:hidden" />
    </>
  );
}
