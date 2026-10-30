import { useState } from 'react';
import { LifeBuoy, ShieldCheck } from 'lucide-react';
import { PageHeader, Tabs } from '../../components/ui/Card.jsx';
import { ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback.jsx';
import { Badge, Pagination } from '../../components/ui/Badge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { masterService } from '../../services/masterService.js';
import { formatDateTime } from '../../utils/format.js';

const PAGE_SIZE = 20;
const SUPPORT = { open: 'Aberto', answered: 'Respondido', closed: 'Encerrado' };
const PRIVACY = { open: 'Aberta', in_progress: 'Em andamento', done: 'Concluída', rejected: 'Recusada' };
const PRIVACY_TYPE = { access: 'Acesso', correction: 'Correção', portability: 'Portabilidade', deletion: 'Exclusão' };
const TONE = { open: 'amber', answered: 'green', in_progress: 'blue', done: 'green', closed: 'slate', rejected: 'slate' };

function StatusSelect({ value, options, onChange, label }) {
  return (
    <select className="input w-auto py-1 text-xs" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function SupportTab() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const state = useAsync(() => masterService.support({ status: status || undefined, page, pageSize: PAGE_SIZE }), [status, page]);
  const data = state.data;
  const change = async (r, next) => {
    try {
      await masterService.setSupportStatus(r.id, next);
      toast.success('Status atualizado.');
      state.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <select className="input mb-4 w-auto" aria-label="Filtrar solicitações" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">Todas</option>
        {Object.entries(SUPPORT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {state.loading && !data ? <Spinner /> : state.error && !data ? <ErrorState error={state.error} onRetry={state.reload} /> : data.items.length === 0 ? <EmptyState icon={LifeBuoy} title="Nenhuma solicitação" /> : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <li key={r.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{r.subject} <Badge tone={TONE[r.status]}>{SUPPORT[r.status]}</Badge></p>
                  <p className="text-xs text-fg/50">/{r.slug} · {r.email} · {formatDateTime(r.createdAt)}</p>
                </div>
                <StatusSelect label={`Status da solicitação ${r.id}`} value={r.status} options={SUPPORT} onChange={(v) => change(r, v)} />
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-fg/80">{r.message}</p>
              <a className="mt-2 inline-block text-xs underline" href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.subject}`)}`}>Responder por e-mail</a>
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
    </>
  );
}

function PrivacyTab() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const state = useAsync(() => masterService.privacyRequests({ status: status || undefined, page, pageSize: PAGE_SIZE }), [status, page]);
  const data = state.data;
  const change = async (r, next) => {
    try {
      await masterService.setPrivacyStatus(r.id, next);
      toast.success('Status atualizado.');
      state.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <select className="input mb-4 w-auto" aria-label="Filtrar solicitações LGPD" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">Todas</option>
        {Object.entries(PRIVACY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {state.loading && !data ? <Spinner /> : state.error && !data ? <ErrorState error={state.error} onRetry={state.reload} /> : data.items.length === 0 ? <EmptyState icon={ShieldCheck} title="Nenhuma solicitação LGPD" /> : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{PRIVACY_TYPE[r.requestType] ?? r.requestType} <Badge tone={TONE[r.status]}>{PRIVACY[r.status]}</Badge></p>
                <p className="text-xs text-fg/50">Titular: {r.subjectType} #{r.subjectId} · assinante #{r.tenantId ?? '—'} · {formatDateTime(r.createdAt)}</p>
                {r.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-fg/80">{r.notes}</p>}
              </div>
              <StatusSelect label={`Status da solicitação LGPD ${r.id}`} value={r.status} options={PRIVACY} onChange={(v) => change(r, v)} />
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
    </>
  );
}

export default function MasterSupportPage() {
  useTitle('Suporte e LGPD — Master');
  const [tab, setTab] = useState('support');
  return (
    <>
      <PageHeader title="Suporte e LGPD" description="Solicitações dos assinantes e pedidos de privacidade. Exclusões e portabilidade exigem execução manual após análise." />
      <Tabs tabs={[{ id: 'support', label: 'Suporte' }, { id: 'privacy', label: 'Privacidade (LGPD)' }]} value={tab} onChange={setTab} />
      {tab === 'support' ? <SupportTab /> : <PrivacyTab />}
    </>
  );
}
