import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, ExternalLink, Receipt, RefreshCw } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { AsyncView, Alert, EmptyState } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tenantService } from '../../services/tenantService.js';
import { copyText, formatDateTime, formatMoney, PAYMENT_STATUS } from '../../utils/format.js';

const OPEN = ['pending', 'in_process'];
const RETURN_MESSAGES = {
  sucesso: { tone: 'success', text: 'Retorno do Mercado Pago recebido. Estamos confirmando o pagamento; isso pode levar alguns instantes.' },
  pendente: { tone: 'info', text: 'Pagamento pendente. Assim que for aprovado, sua assinatura é atualizada automaticamente.' },
  falha: { tone: 'error', text: 'O pagamento não foi concluído. Você pode tentar novamente na página Assinatura.' },
};

function PaymentRow({ payment, onSynced }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const open = OPEN.includes(payment.status);

  const sync = async (silent = false) => {
    setBusy(true);
    try {
      const res = await tenantService.syncPayment(payment.id);
      if (res.payment.status === 'approved') toast.success('Pagamento aprovado! Sua assinatura foi atualizada.');
      else if (!silent) toast.info('Pagamento ainda não confirmado. Tente novamente em instantes.');
      onSynced(res.payment);
    } catch (err) {
      if (!silent) toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyPix = async () => ((await copyText(payment.pix.qrCode)) ? toast.success('Código PIX copiado.') : toast.error('Não foi possível copiar. Selecione o código e copie manualmente.'));

  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{formatMoney(payment.amountCents)}</span>
            <StatusBadge map={PAYMENT_STATUS} value={payment.status} />
            {payment.mode === 'test' && <span className="badge bg-fg/10 text-fg/60">Teste</span>}
          </div>
          <p className="mt-1 text-xs text-fg/50">
            {payment.method === 'pix' ? 'PIX' : 'Mercado Pago'} · {payment.periodMonths} meses · criado em {formatDateTime(payment.createdAt)}
            {payment.paidAt && <> · pago em {formatDateTime(payment.paidAt)}</>}
          </p>
          {payment.periodTo && <p className="text-xs text-fg/50">Período liberado até {formatDateTime(payment.periodTo)}</p>}
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            {payment.checkoutUrl && /^https:\/\//i.test(payment.checkoutUrl) && (
              <a className="btn btn-primary btn-sm" href={payment.checkoutUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden /> Abrir pagamento</a>
            )}
            <Button size="sm" variant="secondary" icon={RefreshCw} loading={busy} onClick={() => sync(false)}>Verificar pagamento</Button>
          </div>
        )}
      </div>

      {open && payment.pix && (
        <div className="mt-4 flex flex-wrap items-start gap-4 rounded-xl border border-fg/10 p-4">
          {payment.pix.qrCodeBase64 && <img className="h-40 w-40 rounded-lg bg-white p-2" alt="QR Code PIX" src={`data:image/png;base64,${payment.pix.qrCodeBase64}`} />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">PIX copia e cola</p>
            <textarea readOnly rows={3} className="input mt-1 font-mono text-xs" value={payment.pix.qrCode} aria-label="Código PIX copia e cola" onFocus={(e) => e.target.select()} />
            <div className="mt-2 flex items-center gap-3">
              <Button size="sm" variant="secondary" icon={Copy} onClick={copyPix}>Copiar código</Button>
              {payment.pix.expiresAt && <span className="text-xs text-fg/50">Expira em {formatDateTime(payment.pix.expiresAt)}</span>}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function PaymentsList({ initial, reload }) {
  const { refresh } = useAuth();
  const [items, setItems] = useState(initial);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => setItems(initial), [initial]);

  const replace = (p) => {
    setItems((list) => list.map((x) => (x.id === p.id ? p : x)));
    if (p.status === 'approved') refresh();
  };

  // Em ambientes onde o webhook não alcança o servidor, consulta o Mercado Pago periodicamente enquanto há PIX aberto.
  useEffect(() => {
    const timer = setInterval(async () => {
      const open = itemsRef.current.filter((p) => OPEN.includes(p.status) && p.method === 'pix');
      for (const p of open) {
        try {
          const res = await tenantService.syncPayment(p.id);
          if (res.payment.status !== p.status) replace(res.payment);
        } catch {
          /* ignora erros de verificação automática */
        }
      }
    }, 20_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items.length === 0) return <EmptyState icon={Receipt} title="Nenhum pagamento">Os pagamentos aparecerão aqui depois da primeira cobrança.</EmptyState>;
  return (
    <div className="space-y-3">
      {items.map((p) => <PaymentRow key={p.id} payment={p} onSynced={(np) => { replace(np); reload(); }} />)}
    </div>
  );
}

export default function PaymentsPage() {
  useTitle('Pagamentos — Painel');
  const [params] = useSearchParams();
  const state = useAsync(() => tenantService.payments(), []);
  const ret = RETURN_MESSAGES[params.get('retorno')];
  return (
    <>
      <PageHeader title="Pagamentos" description="Histórico de cobranças da sua assinatura." />
      {ret && <Alert tone={ret.tone} className="mb-4">{ret.text}</Alert>}
      <AsyncView state={state}>{({ payments }) => <PaymentsList initial={payments} reload={state.reload} />}</AsyncView>
    </>
  );
}
