import { useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { PageHeader, Tabs } from '../../components/ui/Card.jsx';
import { ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback.jsx';
import { Badge, StatusBadge, Pagination } from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { masterService } from '../../services/masterService.js';
import { formatDateTime, formatMoney, PAYMENT_STATUS } from '../../utils/format.js';

const PAGE_SIZE = 20;
const WEBHOOK_STATUS = {
  received: { label: 'Recebido', tone: 'slate' },
  processed: { label: 'Processado', tone: 'green' },
  ignored: { label: 'Ignorado', tone: 'slate' },
  failed: { label: 'Falhou', tone: 'red' },
  invalid_signature: { label: 'Assinatura inválida', tone: 'red' },
};

function EventsDialog({ payment, onClose }) {
  const state = useAsync(() => (payment ? masterService.paymentEvents(payment.id) : Promise.resolve({ events: [] })), [payment?.id]);
  return (
    <Modal open={!!payment} onClose={onClose} title={`Eventos do pagamento #${payment?.id ?? ''}`} size="lg" footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}>
      {state.loading ? <Spinner /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : state.data.events.length === 0 ? <p className="text-sm text-fg/60">Sem eventos.</p> : (
        <ul className="divide-y divide-fg/10 text-sm">
          {state.data.events.map((ev, i) => (
            <li key={i} className="py-2">
              <div className="flex justify-between gap-3"><code className="text-xs">{ev.event}</code><span className="text-xs text-fg/50">{formatDateTime(ev.at)}</span></div>
              {ev.details && <pre className="mt-1 overflow-x-auto rounded bg-fg/5 p-2 text-xs text-fg/70">{JSON.stringify(ev.details, null, 2)}</pre>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function PaymentsTab() {
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const state = useAsync(() => masterService.payments({ status: status || undefined, page, pageSize: PAGE_SIZE }), [status, page]);
  const data = state.data;

  const sync = async (p) => {
    setSyncing(p.id);
    try {
      const res = await masterService.syncPayment(p.id);
      toast.success(`Sincronizado: ${res.outcome}.`);
      state.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(null);
    }
  };

  const columns = [
    { key: 'id', header: '#', render: (p) => `#${p.id}` },
    { key: 'brand', header: 'Assinante', render: (p) => <div><p className="font-medium">{p.brand}</p><p className="text-xs text-fg/50">/{p.slug}</p></div> },
    { key: 'amount', header: 'Valor', render: (p) => formatMoney(p.amountCents) },
    { key: 'method', header: 'Método', render: (p) => <span>{p.method === 'pix' ? 'PIX' : 'Checkout'} {p.mode === 'test' && <Badge>Teste</Badge>}</span> },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge map={PAYMENT_STATUS} value={p.status} /> },
    { key: 'created', header: 'Criado em', render: (p) => formatDateTime(p.createdAt) },
    {
      key: 'actions', header: 'Ações', className: 'text-right', render: (p) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={History} onClick={() => setEvents(p)} aria-label={`Eventos do pagamento ${p.id}`}>Eventos</Button>
          {user?.role === 'master' && ['pending', 'in_process'].includes(p.status) && <Button size="sm" variant="ghost" icon={RefreshCw} loading={syncing === p.id} onClick={() => sync(p)}>Sincronizar</Button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <select className="input mb-4 w-auto" aria-label="Filtrar por status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">Todos os status</option>
        {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      {state.loading && !data ? <Spinner /> : state.error && !data ? <ErrorState error={state.error} onRetry={state.reload} /> : data.items.length === 0 ? <EmptyState title="Nenhum pagamento" /> : <DataTable columns={columns} rows={data.items} caption="Pagamentos" />}
      {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
      <EventsDialog payment={events} onClose={() => setEvents(null)} />
    </>
  );
}

function WebhooksTab() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const state = useAsync(() => masterService.webhookEvents({ status: status || undefined, page, pageSize: PAGE_SIZE }), [status, page]);
  const data = state.data;
  const columns = [
    { key: 'id', header: '#' },
    { key: 'topic', header: 'Tópico', render: (w) => `${w.topic ?? '—'} ${w.mode === 'test' ? '(teste)' : ''}` },
    { key: 'resource_id', header: 'Recurso', render: (w) => <code className="text-xs">{w.resource_id ?? '—'}</code> },
    { key: 'sig', header: 'Assinatura', render: (w) => (w.signature_valid ? <Badge tone="green">Válida</Badge> : <Badge tone="red">Inválida</Badge>) },
    { key: 'status', header: 'Status', render: (w) => <div><StatusBadge map={WEBHOOK_STATUS} value={w.status} />{w.error_message && <p className="mt-1 max-w-xs text-xs text-red-300">{w.error_message}</p>}</div> },
    { key: 'attempts', header: 'Tentativas' },
    { key: 'received_at', header: 'Recebido em', render: (w) => formatDateTime(w.received_at) },
  ];
  return (
    <>
      <select className="input mb-4 w-auto" aria-label="Filtrar por status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">Todos os status</option>
        {Object.entries(WEBHOOK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      {state.loading && !data ? <Spinner /> : state.error && !data ? <ErrorState error={state.error} onRetry={state.reload} /> : data.items.length === 0 ? <EmptyState title="Nenhum webhook recebido" /> : <DataTable columns={columns} rows={data.items} caption="Webhooks" />}
      {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
    </>
  );
}

export default function MasterPaymentsPage() {
  useTitle('Pagamentos — Master');
  const [tab, setTab] = useState('payments');
  return (
    <>
      <PageHeader title="Pagamentos e webhooks" description="Cobranças dos assinantes e notificações recebidas do Mercado Pago." />
      <Tabs tabs={[{ id: 'payments', label: 'Pagamentos' }, { id: 'webhooks', label: 'Webhooks' }]} value={tab} onChange={setTab} />
      {tab === 'payments' ? <PaymentsTab /> : <WebhooksTab />}
    </>
  );
}
