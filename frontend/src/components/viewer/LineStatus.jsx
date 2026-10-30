import { CalendarClock, Tv } from 'lucide-react';
import { formatDate } from '../../utils/format.js';

const DAY_MS = 86_400_000;

/** Situação da linha do cliente (conferida no servidor Xtream): status, vencimento e conexões. */
export default function LineStatus({ account, compact = false }) {
  if (!account) return null;
  const expiresAt = account.expiresAt ? new Date(account.expiresAt) : null;
  const msLeft = expiresAt ? expiresAt.getTime() - Date.now() : null;
  const expired = msLeft !== null && msLeft <= 0;
  const days = msLeft !== null && msLeft > 0 ? Math.ceil(msLeft / DAY_MS) : null;
  const ok = account.active && !expired;
  const soon = ok && days !== null && days <= 7;

  const label = !account.active ? 'Desativada' : expired ? 'Vencida' : 'Ativa';
  const tone = ok ? (soon ? 'text-amber-400' : 'text-emerald-400') : 'text-red-400';

  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-1 text-sm ${compact ? '' : 'rounded-lg border border-fg/10 p-3'}`}>
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${ok ? (soon ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-red-400'}`} aria-hidden="true" />
        <span className={`font-semibold ${tone}`}>{label}</span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-fg/70">
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        {expiresAt ? (
          <>
            {expired ? 'Venceu em' : 'Vence em'} {formatDate(account.expiresAt)}
            {days !== null && <span className="text-fg/50">({days === 1 ? 'falta 1 dia' : `faltam ${days} dias`})</span>}
          </>
        ) : (
          'Sem data de vencimento'
        )}
      </span>
      {account.maxConnections != null && (
        <span className="inline-flex items-center gap-1.5 text-fg/70">
          <Tv className="h-4 w-4" aria-hidden="true" />
          Telas: {account.activeConnections ?? 0}/{account.maxConnections}
        </span>
      )}
      {account.isTrial && <span className="badge">Teste</span>}
    </div>
  );
}
