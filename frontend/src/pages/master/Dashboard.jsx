import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CreditCard, Timer, TrendingUp, UserPlus, Users, Wallet } from 'lucide-react';
import { PageHeader, Card, StatCard } from '../../components/ui/Card.jsx';
import { AsyncView, Alert } from '../../components/ui/Feedback.jsx';
import BarChart, { fillDays } from '../../components/BarChart.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { masterService } from '../../services/masterService.js';
import { formatMoney, PAYMENT_STATUS } from '../../utils/format.js';

function Dashboard({ data }) {
  const t = data.tenants;
  const signups = fillDays(data.series.signups, 30, (s) => s.value);
  const revenue = fillDays(data.series.revenue, 30, (s) => s.valueCents);
  return (
    <>
      <PageHeader title="Painel master" description="Visão geral da plataforma." />
      {data.webhookProblemsLast7Days > 0 && (
        <Alert tone="warning" className="mb-4" action={<Link to="/master/pagamentos" className="underline">Ver webhooks</Link>}>
          {data.webhookProblemsLast7Days} webhook(s) com falha ou assinatura inválida nos últimos 7 dias.
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Assinantes" value={t.total} hint={`${t.newLast7Days} novos em 7 dias · ${t.newLast30Days} em 30`} icon={Users} />
        <StatCard label="Em teste" value={t.trial} icon={Timer} />
        <StatCard label="Ativos (plano)" value={t.active} icon={TrendingUp} tone="text-emerald-300" />
        <StatCard label="Vencidos" value={t.expired} hint={`${t.suspended} suspenso(s) · ${t.canceled} cancelado(s)`} icon={AlertTriangle} tone={t.expired ? 'text-red-300' : ''} />
        <StatCard label="A vencer" value={t.expiringSoon} hint="Planos em 30 dias ou testes em 24 h" icon={CalendarClock} />
        <StatCard label="Receita (produção)" value={formatMoney(data.revenue.production.totalCents)} hint={`${data.revenue.production.payments} pagamento(s) aprovado(s)`} icon={Wallet} />
        <StatCard label="Receita (teste)" value={formatMoney(data.revenue.test.totalCents)} hint="Não contabilizada" icon={CreditCard} />
        <StatCard label="Espectadores" value={data.viewers} icon={UserPlus} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Novos assinantes — 30 dias"><BarChart data={signups} ariaLabel="Novos assinantes por dia" /></Card>
        <Card title="Receita aprovada (produção) — 30 dias"><BarChart data={revenue} format={formatMoney} ariaLabel="Receita por dia" /></Card>
      </div>

      <Card title="Pagamentos por status" className="mt-6">
        {Object.keys(data.payments).length === 0 ? (
          <p className="text-sm text-fg/50">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="flex flex-wrap gap-4 text-sm">
            {Object.entries(data.payments).map(([status, n]) => (
              <li key={status}><span className="text-fg/60">{PAYMENT_STATUS[status]?.label ?? status}:</span> <strong>{n}</strong></li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function MasterDashboard() {
  useTitle('Painel master');
  const state = useAsync(() => masterService.dashboard(), []);
  return <AsyncView state={state}>{(data) => <Dashboard data={data} />}</AsyncView>;
}
