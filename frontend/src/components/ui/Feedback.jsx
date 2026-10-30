import { AlertTriangle, CheckCircle2, Inbox, Info, Loader2, RefreshCw } from 'lucide-react';
import Button from './Button.jsx';

export function Spinner({ label = 'Carregando…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-fg/60 ${className}`} role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Carregando">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

const TONES = {
  info: { cls: 'border-sky-500/30 bg-sky-500/10 text-sky-200', Icon: Info },
  success: { cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200', Icon: CheckCircle2 },
  warning: { cls: 'border-amber-500/30 bg-amber-500/10 text-amber-200', Icon: AlertTriangle },
  error: { cls: 'border-red-500/30 bg-red-500/10 text-red-200', Icon: AlertTriangle },
};

export function Alert({ tone = 'info', title, children, className = '', action }) {
  const { cls, Icon } = TONES[tone];
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${cls} ${className}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, className = '' }) {
  return (
    <div className={`rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center ${className}`} role="alert">
      <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-red-300" aria-hidden />
      <p className="text-sm text-red-100">{error?.message ?? 'Algo deu errado.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-3" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-fg/15 px-6 py-10 text-center">
      <Icon className="mb-3 h-8 w-8 text-fg/30" aria-hidden />
      <p className="font-medium text-fg">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-fg/60">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Renderiza carregando / erro / conteúdo de um resultado de useAsync. */
export function AsyncView({ state, children, skeleton = <PageSkeleton /> }) {
  if (state.loading && !state.data) return skeleton;
  if (state.error && !state.data) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return null;
  return children(state.data);
}
