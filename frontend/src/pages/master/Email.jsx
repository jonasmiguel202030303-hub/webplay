import { useState } from 'react';
import { Mail, Plug, Save } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { Field, PasswordField, Switch } from '../../components/ui/Field.jsx';
import { AsyncView, Alert } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { masterService } from '../../services/masterService.js';
import { fieldErrors } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

function EmailForm({ view, onChanged }) {
  const toast = useToast();
  const [form, setForm] = useState({
    smtpHost: view.smtpHost ?? '',
    smtpPort: view.smtpPort ?? 587,
    smtpSecure: !!view.smtpSecure,
    smtpUser: view.smtpUser ?? '',
    smtpPass: '',
    fromName: view.fromName ?? '',
    fromEmail: view.fromEmail ?? '',
  });
  const [testTo, setTestTo] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = {
        smtpHost: form.smtpHost,
        smtpPort: Number(form.smtpPort) || undefined,
        smtpSecure: !!form.smtpSecure,
        smtpUser: form.smtpUser,
        fromName: form.fromName,
        fromEmail: form.fromEmail,
      };
      if (form.smtpPass) body.smtpPass = form.smtpPass;
      const next = await masterService.saveEmail(body);
      setForm((f) => ({ ...f, smtpPass: '' }));
      toast.success('Configurações de e-mail salvas (senha criptografada).');
      onChanged(next);
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
      const res = await masterService.testEmail(testTo || undefined);
      res.ok ? toast.success(res.message) : toast.error(res.message);
      onChanged(await masterService.email());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card
      title="Servidor de e-mail (SMTP)"
      description="Usado para enviar e-mails de boas-vindas, redefinição de senha, confirmação de pagamento e aviso de vencimento."
      actions={<Badge tone={view.configured ? 'green' : 'slate'}>{view.configured ? 'Configurado' : view.usingEnvFallback ? 'Usando .env do servidor' : 'Não configurado'}</Badge>}
    >
      <dl className="mb-4 space-y-1 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-fg/60">Senha SMTP</dt><dd className="font-mono">{view.smtpPassMasked ?? '—'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-fg/60">Último teste</dt><dd>{view.lastCheckAt ? `${formatDateTime(view.lastCheckAt)} — ${view.lastCheckOk ? 'OK' : 'falhou'}` : '—'}</dd></div>
      </dl>
      {view.lastCheckMessage && <p className={`mb-4 text-xs ${view.lastCheckOk ? 'text-emerald-300' : 'text-red-300'}`}>{view.lastCheckMessage}</p>}

      <form onSubmit={save} className="space-y-4" noValidate autoComplete="off">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Host SMTP" placeholder="smtp.seuservidor.com" value={form.smtpHost} onChange={set('smtpHost')} error={errors.smtpHost} />
          <Field type="number" label="Porta" placeholder="587" value={form.smtpPort} onChange={set('smtpPort')} error={errors.smtpPort} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Usuário SMTP" value={form.smtpUser} onChange={set('smtpUser')} error={errors.smtpUser} autoComplete="off" />
          <PasswordField label="Senha SMTP" value={form.smtpPass} onChange={set('smtpPass')} error={errors.smtpPass} autoComplete="new-password" hint="Deixe vazio para manter a atual. Nunca é exibida por completo." />
        </div>
        <Switch checked={form.smtpSecure} onChange={(v) => setForm((f) => ({ ...f, smtpSecure: v }))} label="Conexão segura (SSL/TLS na porta 465)" description="Desative para STARTTLS nas portas 587/25." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do remetente" placeholder="WebPlay Brasil" value={form.fromName} onChange={set('fromName')} error={errors.fromName} />
          <Field label="E-mail do remetente" placeholder="no-reply@seudominio.com.br" value={form.fromEmail} onChange={set('fromEmail')} error={errors.fromEmail} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" icon={Save} loading={saving}>Salvar</Button>
        </div>
      </form>

      <div className="mt-6 border-t border-fg/10 pt-4">
        <p className="mb-2 text-sm font-medium text-fg">Testar envio</p>
        <div className="flex flex-wrap gap-2">
          <Field className="min-w-[220px] flex-1" placeholder="Enviar teste para (padrão: seu e-mail)" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <Button variant="secondary" icon={Plug} loading={testing} onClick={test}>Enviar teste</Button>
        </div>
      </div>
    </Card>
  );
}

function Email({ initial }) {
  const [view, setView] = useState(initial);
  return (
    <>
      <PageHeader title="E-mail" description="Configure o servidor SMTP usado para todos os e-mails transacionais da plataforma. Somente o master acessa esta página." />
      {!view.configured && view.usingEnvFallback && (
        <Alert tone="warning" className="mb-6">O painel ainda não tem SMTP próprio configurado; os e-mails estão sendo enviados pela configuração padrão do servidor (.env).</Alert>
      )}
      <EmailForm view={view} onChanged={setView} />
    </>
  );
}

export default function EmailSettingsPage() {
  useTitle('E-mail — Master');
  const state = useAsync(() => masterService.email(), []);
  return <AsyncView state={state}>{(data) => <Email initial={data} />}</AsyncView>;
}
