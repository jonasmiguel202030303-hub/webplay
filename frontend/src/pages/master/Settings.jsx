import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { AsyncView } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { invalidatePlatform } from '../../hooks/usePlatform.js';
import { masterService } from '../../services/masterService.js';
import { fieldErrors } from '../../services/api.js';
import { formatMoney } from '../../utils/format.js';

const toForm = (s) => ({ ...s, priceReais: (s.priceCents / 100).toFixed(2).replace('.', ',') });

function parseReais(text) {
  const raw = String(text).trim();
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : NaN;
}

function SettingsForm({ initial }) {
  const toast = useToast();
  const [form, setForm] = useState(toForm(initial));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(toForm(initial)), [initial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const cents = parseReais(form.priceReais);
    if (Number.isNaN(cents)) return setErrors({ priceCents: 'Informe um valor válido, ex.: 97,00.' });
    setSaving(true);
    setErrors({});
    try {
      const saved = await masterService.saveSettings({
        priceCents: cents,
        subscriptionMonths: Number(form.subscriptionMonths),
        trialHours: Number(form.trialHours),
        renewalWindowDays: Number(form.renewalWindowDays),
        headline: form.headline ?? '',
        description: form.description ?? '',
        footerText: form.footerText ?? '',
        supportWhatsapp: form.supportWhatsapp ?? '',
        supportEmail: form.supportEmail ?? '',
        supportHoursText: form.supportHoursText ?? '',
      });
      invalidatePlatform();
      setForm(toForm(saved));
      toast.success('Configurações salvas.');
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader title="Configurações comerciais" description="Valores e textos exibidos para novos e atuais assinantes." actions={<Button type="submit" icon={Save} loading={saving}>Salvar</Button>} />
      <div className="space-y-6">
        <Card title="Plano e teste" description="Mudanças de preço valem para novas cobranças; pagamentos já feitos não são alterados.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Preço do plano (R$)" inputMode="decimal" value={form.priceReais} onChange={set('priceReais')} error={errors.priceCents} hint={`Atual: ${formatMoney(initial.priceCents)}`} />
            <Field type="number" min={1} max={36} label="Duração (meses)" value={form.subscriptionMonths} onChange={set('subscriptionMonths')} error={errors.subscriptionMonths} />
            <Field type="number" min={1} max={720} label="Teste (horas)" value={form.trialHours} onChange={set('trialHours')} error={errors.trialHours} hint="Vale para novos cadastros." />
            <Field type="number" min={0} max={1100} label="Janela de renovação (dias)" value={form.renewalWindowDays} onChange={set('renewalWindowDays')} error={errors.renewalWindowDays} hint="Renovação antecipada permitida nesse período antes do vencimento." />
          </div>
        </Card>
        <Card title="Textos comerciais">
          <div className="grid gap-4">
            <Field label="Título" value={form.headline ?? ''} onChange={set('headline')} error={errors.headline} />
            <Field as="textarea" rows={3} label="Descrição" value={form.description ?? ''} onChange={set('description')} error={errors.description} />
            <Field label="Rodapé" value={form.footerText ?? ''} onChange={set('footerText')} error={errors.footerText} />
          </div>
        </Card>
        <Card title="Suporte">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="WhatsApp" inputMode="tel" value={form.supportWhatsapp ?? ''} onChange={set('supportWhatsapp')} error={errors.supportWhatsapp} hint="DDI + DDD + número." />
            <Field type="email" label="E-mail" value={form.supportEmail ?? ''} onChange={set('supportEmail')} error={errors.supportEmail} />
            <Field label="Horário de atendimento" value={form.supportHoursText ?? ''} onChange={set('supportHoursText')} error={errors.supportHoursText} />
          </div>
        </Card>
      </div>
    </form>
  );
}

export default function MasterSettingsPage() {
  useTitle('Configurações — Master');
  const state = useAsync(() => masterService.settings(), []);
  return <AsyncView state={state}>{(data) => <SettingsForm initial={data} />}</AsyncView>;
}
