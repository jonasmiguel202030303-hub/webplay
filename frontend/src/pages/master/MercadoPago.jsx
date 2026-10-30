import { useState } from 'react';
import { Copy, Plug, Save } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { Field, PasswordField } from '../../components/ui/Field.jsx';
import { AsyncView, Alert } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { masterService } from '../../services/masterService.js';
import { fieldErrors } from '../../services/api.js';
import { copyText, formatDateTime } from '../../utils/format.js';

const LABEL = { test: 'Teste (sandbox)', production: 'Produção' };

function ModeCard({ mode, info, active, onChanged }) {
  const toast = useToast();
  const [form, setForm] = useState({ accessToken: '', publicKey: info.publicKey ?? '', webhookSecret: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = { mode, publicKey: form.publicKey };
      if (form.accessToken) body.accessToken = form.accessToken;
      if (form.webhookSecret) body.webhookSecret = form.webhookSecret;
      const view = await masterService.saveMercadopago(body);
      setForm((f) => ({ ...f, accessToken: '', webhookSecret: '' }));
      toast.success('Credenciais salvas (criptografadas).');
      onChanged(view);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await masterService.testMercadopago(mode);
      res.ok ? toast.success(res.message) : toast.error(res.message);
      onChanged(await masterService.mercadopago());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card
      title={LABEL[mode]}
      actions={<div className="flex gap-2">{active && <Badge tone="blue">Modo ativo</Badge>}<Badge tone={info.configured ? 'green' : 'slate'}>{info.configured ? 'Configurado' : 'Não configurado'}</Badge></div>}
    >
      <dl className="mb-4 space-y-1 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-fg/60">Access Token</dt><dd className="font-mono">{info.accessTokenMasked ?? '—'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-fg/60">Segredo do webhook</dt><dd className="font-mono">{info.webhookSecretMasked ?? '—'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-fg/60">Último teste</dt><dd>{info.lastCheckAt ? `${formatDateTime(info.lastCheckAt)} — ${info.lastCheckOk ? 'OK' : 'falhou'}` : '—'}</dd></div>
      </dl>
      {info.lastCheckMessage && <p className={`mb-4 text-xs ${info.lastCheckOk ? 'text-emerald-300' : 'text-red-300'}`}>{info.lastCheckMessage}</p>}

      <form onSubmit={save} className="space-y-4" noValidate autoComplete="off">
        <PasswordField label="Access Token" value={form.accessToken} onChange={set('accessToken')} error={errors.accessToken} autoComplete="new-password" hint="Deixe vazio para manter o atual. Nunca é exibido por completo." />
        <Field label="Public Key" value={form.publicKey} onChange={set('publicKey')} error={errors.publicKey} />
        <PasswordField label="Segredo do webhook (assinatura)" value={form.webhookSecret} onChange={set('webhookSecret')} error={errors.webhookSecret} autoComplete="new-password" hint="Obtido nas configurações de Webhooks do Mercado Pago. Mínimo de 8 caracteres." />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" icon={Save} loading={saving}>Salvar</Button>
          <Button variant="secondary" icon={Plug} loading={testing} disabled={!info.configured} onClick={test}>Testar conexão</Button>
        </div>
      </form>
    </Card>
  );
}

function MercadoPago({ initial }) {
  const toast = useToast();
  const [view, setView] = useState(initial);
  const [confirmMode, setConfirmMode] = useState(null);
  const [switching, setSwitching] = useState(false);

  const switchMode = async (mode) => {
    setSwitching(true);
    try {
      setView(await masterService.setMercadopagoMode(mode));
      toast.success(`Modo alterado para ${LABEL[mode]}.`);
      setConfirmMode(null);
    } catch (err) {
      toast.error(err.message);
      setConfirmMode(null);
    } finally {
      setSwitching(false);
    }
  };

  const copy = async () => ((await copyText(view.webhookUrl)) ? toast.success('URL copiada.') : toast.error('Não foi possível copiar.'));

  return (
    <>
      <PageHeader title="Mercado Pago" description="Credenciais, modo de operação e webhook. Somente o master acessa esta página." />
      <Card title="Modo de operação" description="O modo ativo define qual conta cobra os assinantes. Pagamentos de teste nunca liberam receita real.">
        <div className="flex flex-wrap items-center gap-3">
          {['test', 'production'].map((m) => (
            <Button key={m} variant={view.activeMode === m ? 'primary' : 'secondary'} disabled={switching || view.activeMode === m} onClick={() => (m === 'production' ? setConfirmMode(m) : switchMode(m))}>
              {LABEL[m]}{view.activeMode === m ? ' (ativo)' : ''}
            </Button>
          ))}
        </div>
        {view.activeMode === 'test' && <Alert tone="warning" className="mt-4">Modo de teste ativo: as cobranças usam o sandbox e não geram receita real.</Alert>}
      </Card>

      <Card title="URL do webhook" description="Cadastre esta URL no painel de Webhooks do Mercado Pago (evento: Pagamentos). Em produção precisa ser HTTPS." className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-fg/10 px-3 py-2 text-sm">{view.webhookUrl}</code>
          <Button variant="secondary" icon={Copy} onClick={copy}>Copiar</Button>
        </div>
        {!view.webhookUrl.startsWith('https://') && <p className="hint mt-2">Em localhost o Mercado Pago não consegue chamar o webhook; o assinante pode usar "Verificar pagamento" para sincronizar.</p>}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {['test', 'production'].map((m) => (
          <ModeCard key={m} mode={m} info={view.modes[m]} active={view.activeMode === m} onChanged={setView} />
        ))}
      </div>

      <ConfirmDialog open={confirmMode === 'production'} title="Ativar modo produção?" message="Novas cobranças passarão a usar a conta real do Mercado Pago e dinheiro de verdade será movimentado. Confirme que as credenciais de produção foram testadas." confirmLabel="Ativar produção" loading={switching} onConfirm={() => switchMode('production')} onCancel={() => setConfirmMode(null)} />
    </>
  );
}

export default function MercadoPagoPage() {
  useTitle('Mercado Pago — Master');
  const state = useAsync(() => masterService.mercadopago(), []);
  return <AsyncView state={state}>{(data) => <MercadoPago initial={data} />}</AsyncView>;
}
