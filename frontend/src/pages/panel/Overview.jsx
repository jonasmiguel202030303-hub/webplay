import { Link } from 'react-router-dom';
import { Check, Circle, Copy, ExternalLink, Server, Users } from 'lucide-react';
import { PageHeader, Card, StatCard } from '../../components/ui/Card.jsx';
import { AsyncView } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useCountdown } from '../../hooks/useCountdown.js';
import { useTitle } from '../../hooks/useTitle.js';
import { tenantService } from '../../services/tenantService.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { copyText, formatDate, formatDateTime, formatRemaining, SUBSCRIPTION_STATUS } from '../../utils/format.js';

const ACTIONS = {
  'auth.login': 'Login no painel',
  'tenant.brand_update': 'Marca atualizada',
  'tenant.slug_change': 'Endereço alterado',
  'tenant.settings_update': 'Configurações atualizadas',
  'source.create': 'Servidor adicionado',
  'source.update': 'Servidor atualizado',
  'source.delete': 'Servidor removido',
  'payment.create': 'Cobrança criada',
  'payment.approved': 'Pagamento aprovado',
};

function Overview({ data }) {
  const toast = useToast();
  const sub = data.subscription;
  const remaining = useCountdown(sub.endsAt, sub.serverNow);
  const link = `${window.location.origin}/${data.tenant.slug}`;
  const steps = [
    { done: !!(data.brand.assets.logo || data.brand.bannerTitle), label: 'Personalize a marca', to: '/painel/marca' },
    { done: data.counts.servers > 0, label: 'Conecte um servidor de conteúdo', to: '/painel/servidores' },
  ];

  const copy = async () => (await copyText(link)) ? toast.success('Link copiado.') : toast.error('Não foi possível copiar. Selecione e copie manualmente.');

  return (
    <>
      <PageHeader title={`Olá, ${data.brand.displayName}`} description="Resumo da sua plataforma." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Situação" value={<StatusBadge map={SUBSCRIPTION_STATUS} value={sub.status} />} hint={sub.hasAccess ? `Termina em ${formatDate(sub.endsAt)}` : 'Acesso dos espectadores bloqueado'} />
        <StatCard label={sub.status === 'trial' ? 'Tempo de teste' : 'Tempo restante'} value={sub.hasAccess ? formatRemaining(remaining) : '—'} hint="Calculado pelo servidor" />
        <StatCard label="Espectadores" value={data.counts.viewers} hint={`${data.counts.profiles} perfis`} icon={Users} />
        <StatCard label="Servidores" value={data.counts.servers} hint={`${data.counts.serversOnline} online`} icon={Server} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Sua página" description="Compartilhe este endereço com seus espectadores." className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-fg/10 px-3 py-2 text-sm">{link}</code>
            <Button variant="secondary" icon={Copy} onClick={copy}>Copiar</Button>
            <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-primary"><ExternalLink className="h-4 w-4" aria-hidden /> Abrir</a>
          </div>
          {!sub.hasAccess && <p className="mt-3 text-sm text-amber-300">Sua página está indisponível para os espectadores enquanto a assinatura não for regularizada.</p>}
        </Card>

        <Card title="Primeiros passos">
          <ul className="space-y-3 text-sm">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                {s.done ? <Check className="h-4 w-4 text-emerald-400" aria-label="Concluído" /> : <Circle className="h-4 w-4 text-fg/30" aria-label="Pendente" />}
                <Link to={s.to} className={s.done ? 'text-fg/50 line-through' : 'hover:underline'}>{s.label}</Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Atividade recente" className="mt-6">
        {data.activity.length === 0 ? (
          <p className="text-sm text-fg/50">Nenhuma atividade registrada ainda.</p>
        ) : (
          <ul className="divide-y divide-fg/10 text-sm">
            {data.activity.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span>{ACTIONS[a.action] ?? a.action}{a.result !== 'success' && <span className="ml-2 text-xs text-red-300">({a.result})</span>}</span>
                <span className="text-xs text-fg/50">{formatDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function PanelOverview() {
  useTitle('Visão geral — Painel');
  const state = useAsync(() => tenantService.overview(), []);
  return <AsyncView state={state}>{(data) => <Overview data={data} />}</AsyncView>;
}
