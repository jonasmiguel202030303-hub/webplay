import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { Field, Switch } from '../../components/ui/Field.jsx';
import { AsyncView } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { tenantService } from '../../services/tenantService.js';
import { fieldErrors } from '../../services/api.js';

function SettingsForm({ initial }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(initial), [initial]);

  const num = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) }));
  const flag = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = await tenantService.saveSettings({
        allowViewerSignup: form.allowViewerSignup,
        kidsProfilesEnabled: form.kidsProfilesEnabled,
        uiSoundsEnabled: form.uiSoundsEnabled,
        maxProfilesPerViewer: Number(form.maxProfilesPerViewer),
        maxSessionsPerViewer: Number(form.maxSessionsPerViewer),
        catalogCacheTtlSeconds: Number(form.catalogCacheTtlSeconds),
      });
      setForm(saved);
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
      <PageHeader title="Player e acesso" description="Regras de cadastro, perfis e catálogo da sua página." actions={<Button type="submit" icon={Save} loading={saving}>Salvar</Button>} />
      <div className="space-y-6">
        <Card title="Espectadores">
          <div className="space-y-4">
            <Switch checked={form.allowViewerSignup} onChange={flag('allowViewerSignup')} label="Permitir cadastro pelo próprio espectador" description="Desative para que apenas você crie contas pelo painel." />
            <Switch checked={form.kidsProfilesEnabled} onChange={flag('kidsProfilesEnabled')} label="Perfis infantis" description="Perfis infantis ocultam categorias adultas. O filtro é uma heurística pelo nome da categoria e não substitui a supervisão de um responsável." />
            <Switch checked={form.uiSoundsEnabled} onChange={flag('uiSoundsEnabled')} label="Sons da interface" description="Sons curtos em ações de navegação." />
          </div>
        </Card>
        <Card title="Limites">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field type="number" min={1} max={10} label="Perfis por espectador" value={form.maxProfilesPerViewer} onChange={num('maxProfilesPerViewer')} error={errors.maxProfilesPerViewer} />
            <Field type="number" min={1} max={10} label="Sessões simultâneas" value={form.maxSessionsPerViewer} onChange={num('maxSessionsPerViewer')} error={errors.maxSessionsPerViewer} hint="Ao exceder, a sessão mais antiga é encerrada." />
            <Field type="number" min={60} max={86400} label="Cache do catálogo (segundos)" value={form.catalogCacheTtlSeconds} onChange={num('catalogCacheTtlSeconds')} error={errors.catalogCacheTtlSeconds} hint="Entre 60 e 86400." />
          </div>
          <p className="hint mt-3">Limite de espectadores da conta: {initial.maxViewers}. Definido pela plataforma.</p>
        </Card>
      </div>
    </form>
  );
}

export default function PlayerSettingsPage() {
  useTitle('Player — Painel');
  const state = useAsync(() => tenantService.settings(), []);
  return <AsyncView state={state}>{(data) => <SettingsForm initial={data} />}</AsyncView>;
}
