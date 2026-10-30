import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui/Card.jsx';
import { ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback.jsx';
import { StatusBadge, Pagination } from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useTitle } from '../../hooks/useTitle.js';
import { masterService } from '../../services/masterService.js';
import { formatDate, SUBSCRIPTION_STATUS } from '../../utils/format.js';

const PAGE_SIZE = 20;

export default function TenantsPage() {
  useTitle('Assinantes — Master');
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const state = useAsync(() => masterService.tenants({ search: debounced || undefined, status: status || undefined, page, pageSize: PAGE_SIZE }), [debounced, status, page]);
  const data = state.data;

  const columns = [
    { key: 'brand', header: 'Marca', render: (t) => <div><Link to={`/master/assinantes/${t.id}`} className="font-medium underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>{t.brand}</Link><p className="text-xs text-fg/50">/{t.slug}</p></div> },
    { key: 'owner', header: 'Responsável', render: (t) => <div><p>{t.ownerName}</p><p className="text-xs text-fg/50">{t.ownerEmail}</p></div> },
    { key: 'status', header: 'Situação', render: (t) => <StatusBadge map={SUBSCRIPTION_STATUS} value={t.status} /> },
    { key: 'ends', header: 'Vence em', render: (t) => formatDate(t.status === 'trial' ? t.trialEndsAt : t.planEndsAt) },
    { key: 'created', header: 'Cadastro', render: (t) => formatDate(t.createdAt) },
  ];

  return (
    <>
      <PageHeader title="Assinantes" description="Todas as marcas cadastradas na plataforma." />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg/40" aria-hidden />
          <input type="search" className="input pl-9" placeholder="Buscar por nome, e-mail ou endereço" aria-label="Buscar assinantes" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input w-auto" aria-label="Filtrar por situação" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todas as situações</option>
          {Object.entries(SUBSCRIPTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {state.loading && !data ? <Spinner /> : state.error && !data ? <ErrorState error={state.error} onRetry={state.reload} /> : data.items.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum assinante encontrado">Ajuste os filtros de busca.</EmptyState>
      ) : (
        <DataTable columns={columns} rows={data.items} caption="Assinantes" onRowClick={(t) => navigate(`/master/assinantes/${t.id}`)} />
      )}
      {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
    </>
  );
}
