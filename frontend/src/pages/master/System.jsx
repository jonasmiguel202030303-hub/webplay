import { Activity, Cpu, Database, Server } from 'lucide-react';
import { PageHeader, Card, StatCard } from '../../components/ui/Card.jsx';
import { AsyncView } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { masterService } from '../../services/masterService.js';

const formatUptime = (s) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min ${s % 60}s`;
};

function System({ data, onReload }) {
  const m = data.metrics;
  const columns = [
    { key: 'route', header: 'Rota', render: (r) => <code className="text-xs">{r.route}</code> },
    { key: 'count', header: 'Requisições' },
    { key: 'avgMs', header: 'Média (ms)' },
    { key: 'maxMs', header: 'Máx. (ms)' },
    { key: 'errors', header: 'Erros 5xx', render: (r) => (r.errors ? <span className="text-red-300">{r.errors}</span> : 0) },
  ];
  return (
    <>
      <PageHeader title="Sistema" description="Saúde e métricas desde a última inicialização do servidor." actions={<Button variant="secondary" onClick={onReload}>Atualizar</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Banco de dados" value={<Badge tone={data.database.ok ? 'green' : 'red'}>{data.database.ok ? 'OK' : 'Falha'}</Badge>} hint={`${data.database.latencyMs} ms`} icon={Database} />
        <StatCard label="Disponibilidade" value={formatUptime(data.uptimeSeconds)} hint={`Node ${data.node}`} icon={Activity} />
        <StatCard label="Memória" value={`${data.memoryMb.rss} MB`} hint={`Heap ${data.memoryMb.heapUsed} MB`} icon={Server} />
        <StatCard label="CPU acumulada" value={`${Math.round((m.cpuMs.user + m.cpuMs.system) / 1000)} s`} hint={`${m.totalRequests} requisições · ${m.errors5xx} erros 5xx`} icon={Cpu} />
      </div>
      <Card title="Ambiente" className="mt-6">
        <p className="text-sm">Versão {data.version} · ambiente <strong>{data.env === 'production' ? 'produção' : 'desenvolvimento'}</strong></p>
      </Card>
      <h2 className="mb-3 mt-6 text-base font-semibold">Rotas mais usadas</h2>
      <DataTable columns={columns} rows={m.routes} rowKey="route" caption="Métricas por rota" />
    </>
  );
}

export default function SystemPage() {
  useTitle('Sistema — Master');
  const state = useAsync(() => masterService.system(), []);
  return <AsyncView state={state}>{(data) => <System data={data} onReload={state.reload} />}</AsyncView>;
}
