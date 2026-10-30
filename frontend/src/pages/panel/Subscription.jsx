import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreditCard, QrCode } from 'lucide-react';
import { PageHeader, Card, StatCard } from '../../components/ui/Card.jsx';
import { AsyncView, Alert } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useCountdown } from '../../hooks/useCountdown.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tenantService } from '../../services/tenantService.js';
import { formatDate, formatMoney, formatRemaining, SUBSCRIPTION_STATUS } from '../../utils/format.js';

function SubscriptionView({ data }) {
  const toast = useToast();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const sub = data.subscription;
  const remaining = useCountdown(sub.endsAt, sub.serverNow);
  const [busy, setBusy] = useState(null);

  const pay = async (method) => {
    setBusy(method);
    try {
      const { payment } = await tenantService.checkout(method);
      if (method === 'checkout') {
        if (payment.checkoutUrl && /^https:\/\//i.test(payment.checkoutUrl)) {
          window.location.assign(payment.checkoutUrl);
          return;
        }
        throw new Error('O Mercado Pago não retornou um link de pagamento válido. Tente novamente.');
      }
      toast.success('Cobrança PIX gerada. Veja o QR Code em Pagamentos.');
      navigate('/painel/pagamentos');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const months = sub.price.months;
  return (
    <>
      <PageHeader title="Assinatura" description="Seu plano e a renovação." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Situação" value={<StatusBadge map={SUBSCRIPTION_STATUS} value={sub.status} />} hint={sub.suspendedReason ? `Motivo: ${sub.suspendedReason}` : undefined} />
        <StatCard label="Vencimento" value={sub.hasAccess ? formatDate(sub.endsAt) : '—'} hint={sub.hasAccess ? `${sub.remainingDays} dia(s) restante(s)` : 'Sem acesso ativo'} />
        <StatCard label="Contagem regressiva" value={sub.hasAccess ? formatRemaining(remaining) : '—'} hint="Calculada pelo servidor" />
      </div>

      <Card title={`Plano anual — ${formatMoney(sub.price.cents)}`} description={`Acesso por ${months} meses à plataforma completa de personalização.`} className="mt-6">
        {sub.status === 'trial' && <Alert tone="info" className="mb-4">Você está no período de teste. Ao assinar, os {months} meses começam a contar a partir da aprovação do pagamento.</Alert>}
        {sub.status === 'expired' && <Alert tone="warning" className="mb-4">Sua assinatura venceu e a página dos espectadores está indisponível. Seus dados estão preservados; renove para reativar.</Alert>}
        {sub.status === 'suspended' && <Alert tone="error" className="mb-4">Assinatura suspensa. Entre em contato com o suporte pela página Ajuda.</Alert>}
        {!data.paymentsConfigured && <Alert tone="warning" className="mb-4">O pagamento online ainda não está disponível nesta plataforma. Fale com o suporte para renovar.</Alert>}
        {!sub.canRenew && sub.status === 'active' && <Alert tone="info" className="mb-4">A renovação antecipada fica disponível quando faltarem {sub.renewalWindowDays} dias ou menos para o vencimento.</Alert>}

        <div className="flex flex-wrap gap-3">
          <Button icon={CreditCard} loading={busy === 'checkout'} disabled={!sub.canRenew || !data.paymentsConfigured || !!busy} onClick={() => pay('checkout')}>Pagar com Mercado Pago</Button>
          <Button variant="secondary" icon={QrCode} loading={busy === 'pix'} disabled={!sub.canRenew || !data.paymentsConfigured || !!busy} onClick={() => pay('pix')}>Pagar com PIX</Button>
          <Link to="/painel/pagamentos" className="btn btn-ghost">Ver pagamentos</Link>
        </div>
        <p className="hint mt-3">A confirmação é automática após a aprovação do pagamento. Reembolsos e contestações são analisados manualmente pelo suporte.</p>
      </Card>
    </>
  );
}

export default function SubscriptionPage() {
  useTitle('Assinatura — Painel');
  const state = useAsync(() => tenantService.subscription(), []);
  return <AsyncView state={state}>{(data) => <SubscriptionView data={data} />}</AsyncView>;
}
