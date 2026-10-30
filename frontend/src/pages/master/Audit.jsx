import { useState } from 'react';
import { PageHeader } from '../../components/ui/Card.jsx';
import { ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback.jsx';
import { Badge, Pagination } from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useTitle } from '../../hooks/useTitle.js';
import { masterService } from '../../services/masterService.js';
import { formatDateTime } from '../../utils/format.js';

const PAGE_SIZE = 30;
const RESULT = { success: { label: 'Sucesso', tone: 'green' }, failure: { label: 'Falha', tone: 'red' }, denied: { label: 'Negado', tone: 'amber' } };

export default function AuditPage() {
  useTitle('Auditoria — Master');
  const [action, setAction] = useState('');
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(action);
  const state = useAsync(() => masterService.audit({ action: debounced || undefined, result: result || undefined, page, pageSize: PAGE_SIZE }), [debounced, result, page]);
  const data = state.data;

  const columns = [
    { key: 'at', header: 'Data', render: (a) => formatDateTime(a.at) },
    { key: 'action', header: 'Ação', render: (a) => <code className="text-xs">{a.action}</code> },
    { key: 'result', header: 'Resultado', render: (a) => <Badge tone={RESULT[a.result]?.tone}>{RESULT[a.result]?.label ?? a.result}</Badge> },
    { key: 'actor', header: 'Autor', render: (a) => <span>{a.actorEmail ?? 'sistema'} {a.actorRole && <span className="text-xs text-fg/50">({a.actorRole})</span>}</span> },
    { key: 'entity', header: 'Entidade', render: (a) => (a.entityType ? `${a.entityType}${a.entityId ? ` #${a.entityId}` : ''}` : '—') },
    { key: 'details', header: 'Detalhes', render: (a) => <span className="break-words text-xs text-fg/60">{a.reason ?? (a.metadata ? JSON.stringify(a.metadata).slice(0, 140) : '')}{a.ip ? ` · ${a.ip}` : ''}</span> },
  ];

  return (
    <>
      <PageHeader title="Auditoria" description="Registro de ações sensíveis. Senhas e tokens nunca são gravados." />
      <div className="mb-4 flex flex-wrap gap-3">
        <input type="search" className="input max-w-xs" placeholder="Filtrar por ação (ex.: payment)" aria-label="Filtrar por ação" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        <select className="input w-auto" aria-label="Filtrar por resultado" value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }}>
          <option value="">Todos os resultados</option>
          {Object.entries(RESULT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {state.loading && !data ? <Spinner /> : state.error && !data ? <ErrorState error={state.error} onRetry={state.reload} /> : data.items.length === 0 ? <EmptyState title="Nenhum registro" /> : <DataTable columns={columns} rows={data.items} caption="Auditoria" />}
      {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
    </>
  );
}
