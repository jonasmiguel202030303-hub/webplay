import { Link } from 'react-router-dom';
import { Clock, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCountdown } from '../hooks/useCountdown.js';
import { formatRemaining, formatDate } from '../utils/format.js';

/** Faixa de situação da assinatura. O estado vem do servidor (status/hasAccess); aqui só se exibe. */
export default function SubscriptionBanner() {
  const { subscription: s } = useAuth();
  const remaining = useCountdown(s?.endsAt, s?.serverNow);
  if (!s) return null;

  if (s.status === 'suspended') {
    return (
      <div className="flex items-center gap-2 bg-amber-500/15 px-4 py-2 text-sm text-amber-200" role="alert">
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        <span>Conta suspensa{s.suspendedReason ? `: ${s.suspendedReason}` : '.'} Fale com o suporte na página de Ajuda.</span>
      </div>
    );
  }
  if (!s.hasAccess) {
    return (
      <div className="flex flex-wrap items-center gap-2 bg-red-500/15 px-4 py-2 text-sm text-red-200" role="alert">
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          {s.phase === 'trial' || s.status === 'trial' ? 'Seu teste gratuito terminou.' : 'Sua assinatura venceu.'} A página dos seus espectadores está indisponível.
        </span>
        <Link to="/painel/assinatura" className="font-semibold underline">Assinar agora</Link>
      </div>
    );
  }
  if (s.status === 'trial') {
    return (
      <div className="flex flex-wrap items-center gap-2 bg-sky-500/15 px-4 py-2 text-sm text-sky-100">
        <Clock className="h-4 w-4 shrink-0" aria-hidden />
        <span>Teste gratuito: restam <strong>{formatRemaining(remaining)}</strong> (termina em {formatDate(s.endsAt)}).</span>
        <Link to="/painel/assinatura" className="font-semibold underline">Ver plano anual</Link>
      </div>
    );
  }
  if (s.status === 'active' && s.remainingDays !== null && s.remainingDays <= 30) {
    return (
      <div className="flex flex-wrap items-center gap-2 bg-amber-500/15 px-4 py-2 text-sm text-amber-100">
        <Clock className="h-4 w-4 shrink-0" aria-hidden />
        <span>Sua assinatura vence em {s.remainingDays} dia(s) ({formatDate(s.endsAt)}).</span>
        <Link to="/painel/assinatura" className="font-semibold underline">Renovar</Link>
      </div>
    );
  }
  return null;
}
