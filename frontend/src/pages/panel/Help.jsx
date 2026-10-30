import { useState } from 'react';
import { LifeBuoy, Mail, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { usePlatform } from '../../hooks/usePlatform.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { tenantService } from '../../services/tenantService.js';
import { fieldErrors } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

const SUPPORT_STATUS = { open: { label: 'Aberto', tone: 'amber' }, answered: { label: 'Respondido', tone: 'green' }, closed: { label: 'Encerrado', tone: 'slate' } };
const PRIVACY_TYPES = [
  { value: 'access', label: 'Acesso aos meus dados' },
  { value: 'correction', label: 'Correção de dados' },
  { value: 'portability', label: 'Portabilidade' },
  { value: 'deletion', label: 'Exclusão da conta e dos dados' },
];

function SupportForm({ onSent }) {
  const toast = useToast();
  const [form, setForm] = useState({ subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await tenantService.createSupport(form);
      toast.success('Solicitação enviada. Responderemos pelo e-mail da sua conta.');
      setForm({ subject: '', message: '' });
      onSent();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Assunto" required value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} error={errors.subject} />
      <Field as="textarea" rows={5} label="Mensagem" required value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} error={errors.message} hint="Descreva o que aconteceu. Nunca envie senhas." />
      <Button type="submit" icon={Send} loading={busy}>Enviar solicitação</Button>
    </form>
  );
}

function PrivacyForm() {
  const toast = useToast();
  const [form, setForm] = useState({ requestType: 'access', notes: '' });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await tenantService.createPrivacyRequest(form);
      toast.success('Solicitação registrada. Ela será analisada pela equipe da plataforma.');
      setForm({ requestType: 'access', notes: '' });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field as="select" label="Tipo de solicitação" value={form.requestType} onChange={(e) => setForm((f) => ({ ...f, requestType: e.target.value }))}>
        {PRIVACY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </Field>
      <Field as="textarea" rows={3} label="Observações (opcional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} error={errors.notes} />
      <Button type="submit" variant="secondary" icon={ShieldCheck} loading={busy}>Registrar solicitação</Button>
    </form>
  );
}

export default function HelpPage() {
  useTitle('Ajuda — Painel');
  const platform = usePlatform();
  const requests = useAsync(() => tenantService.supportRequests(), []);
  const wa = platform?.supportWhatsapp?.replace(/\D/g, '');

  return (
    <>
      <PageHeader title="Ajuda e suporte" description="Fale com a equipe da WebPlay Brasil e exerça seus direitos de privacidade." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Contato">
            <ul className="space-y-2 text-sm">
              {wa && <li className="flex items-center gap-2"><MessageCircle className="h-4 w-4" aria-hidden /> <a className="underline" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp {platform.supportWhatsapp}</a></li>}
              {platform?.supportEmail && <li className="flex items-center gap-2"><Mail className="h-4 w-4" aria-hidden /> <a className="underline" href={`mailto:${platform.supportEmail}`}>{platform.supportEmail}</a></li>}
              {platform?.supportHoursText && <li className="text-fg/60">{platform.supportHoursText}</li>}
              {platform && !wa && !platform.supportEmail && <li className="text-fg/60">Use o formulário abaixo para falar com o suporte.</li>}
            </ul>
          </Card>
          <Card title="Abrir solicitação" description="Responderemos pelo e-mail da sua conta.">
            <SupportForm onSent={requests.reload} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Minhas solicitações">
            {requests.loading && !requests.data ? <Spinner /> : requests.error && !requests.data ? <Alert tone="error">{requests.error.message}</Alert> : requests.data.requests.length === 0 ? (
              <EmptyState icon={LifeBuoy} title="Nenhuma solicitação" />
            ) : (
              <ul className="divide-y divide-fg/10">
                {requests.data.requests.map((r) => (
                  <li key={r.id} className="py-3 text-sm">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{r.subject}</span><Badge tone={(SUPPORT_STATUS[r.status] ?? SUPPORT_STATUS.open).tone}>{(SUPPORT_STATUS[r.status] ?? SUPPORT_STATUS.open).label}</Badge></div>
                    <p className="mt-1 line-clamp-2 text-fg/60">{r.message}</p>
                    <p className="mt-1 text-xs text-fg/40">{formatDateTime(r.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Privacidade (LGPD)" description="Solicite acesso, correção, portabilidade ou exclusão dos seus dados.">
            <PrivacyForm />
          </Card>
        </div>
      </div>
    </>
  );
}
