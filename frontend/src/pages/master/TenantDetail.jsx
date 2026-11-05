import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, ExternalLink, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { PageHeader, Card, StatCard } from '../../components/ui/Card.jsx';
import { AsyncView, Alert } from '../../components/ui/Feedback.jsx';
import { Field } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { masterService } from '../../services/masterService.js';
import { fieldErrors } from '../../services/api.js';
import { formatDate, formatDateTime, formatMoney, PAYMENT_STATUS, SUBSCRIPTION_STATUS } from '../../utils/format.js';

function ReasonDialog({ open, title, label, minHint, confirmLabel, extra, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(30);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await onSubmit({ reason, days: Number(days) });
      setReason('');
    } catch (err) {
      setErrors({ ...fieldErrors(err), _: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="reason-form" loading={busy}>{confirmLabel}</Button></>}>
      <form id="reason-form" onSubmit={submit} className="space-y-4" noValidate>
        {extra === 'days' && <Field type="number" min={1} max={730} label="Dias a conceder" value={days} onChange={(e) => setDays(e.target.value)} error={errors.days} />}
        <Field as="textarea" rows={3} label={label} required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} hint={minHint} />
        {errors._ && !errors.reason && !errors.days && <Alert tone="error">{errors._}</Alert>}
        <p className="hint">A ação fica registrada na auditoria com o seu usuário.</p>
      </form>
    </Modal>
  );
}

function EditDialog({ open, tenant, onClose, onSubmit }) {
  const [form, setForm] = useState({ displayName: '', slug: '', ownerName: '', ownerEmail: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && tenant) {
      setForm({ displayName: tenant.brand.displayName, slug: tenant.slug, ownerName: tenant.owner.name, ownerEmail: tenant.owner.email });
      setErrors({});
    }
  }, [open, tenant]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await onSubmit(form);
    } catch (err) {
      setErrors({ ...fieldErrors(err), _: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Editar assinante" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="edit-tenant-form" loading={busy}>Salvar</Button></>}>
      <form id="edit-tenant-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nome da plataforma" required value={form.displayName} onChange={set('displayName')} error={errors.displayName} />
        <Field label="Endereço (slug)" required value={form.slug} onChange={set('slug')} error={errors.slug} hint="Usado na URL da página do assinante (ex.: webplaybrasil.online/seu-slug)." />
        <Field label="Nome do responsável" required value={form.ownerName} onChange={set('ownerName')} error={errors.ownerName} />
        <Field type="email" label="E-mail do responsável" required value={form.ownerEmail} onChange={set('ownerEmail')} error={errors.ownerEmail} />
        {errors._ && !errors.displayName && !errors.slug && !errors.ownerName && !errors.ownerEmail && <Alert tone="error">{errors._}</Alert>}
        <p className="hint">A ação fica registrada na auditoria com o seu usuário.</p>
      </form>
    </Modal>
  );
}

function Detail({ initial }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [t, setT] = useState(initial);
  const [dialog, setDialog] = useState(null);
  const [reactivating, setReactivating] = useState(false);
  const sub = t.subscription;
  const isMaster = user?.role === 'master';
  useTitle(`${t.brand.displayName} — Master`);

  const act = async (fn, message) => {
    const updated = await fn();
    setT(updated);
    setDialog(null);
    toast.success(message);
  };

  const reactivate = async () => {
    try {
      await act(() => masterService.reactivate(t.id), 'Assinante reativado.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReactivating(false);
    }
  };

  const saveEdit = async (form) => {
    const updated = await masterService.updateTenant(t.id, form);
    setT(updated);
    setDialog(null);
    toast.success('Assinante atualizado.');
  };

  const confirmDelete = async ({ reason }) => {
    await masterService.deleteTenant(t.id, reason);
    toast.success('Assinante excluído.');
    navigate('/master/assinantes');
  };

  return (
    <>
      <Link to="/master/assinantes" className="mb-3 inline-flex items-center gap-1 text-sm text-fg/60 hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden /> Assinantes</Link>
      <PageHeader
        title={t.brand.displayName}
        description={`/${t.slug} · cadastrado em ${formatDate(t.createdAt)}`}
        actions={
          <>
            <a className="btn btn-secondary" href={`/${t.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden /> Abrir página</a>
            {isMaster && <Button variant="secondary" icon={Pencil} onClick={() => setDialog('edit')}>Editar</Button>}
            {isMaster && <Button variant="secondary" icon={CalendarPlus} onClick={() => setDialog('grant')}>Conceder dias</Button>}
            {sub.status === 'suspended' ? <Button icon={Play} onClick={() => setReactivating(true)}>Reativar</Button> : <Button variant="danger" icon={Pause} onClick={() => setDialog('suspend')}>Suspender</Button>}
            {isMaster && <Button variant="danger" icon={Trash2} onClick={() => setDialog('delete')}>Excluir</Button>}
          </>
        }
      />
      {sub.status === 'suspended' && sub.suspendedReason && <Alert tone="warning" className="mb-4">Suspenso. Motivo: {sub.suspendedReason}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Situação" value={<StatusBadge map={SUBSCRIPTION_STATUS} value={sub.status} />} hint={sub.hasAccess ? `${sub.remainingDays} dia(s) restante(s)` : 'Sem acesso'} />
        <StatCard label="Vencimento" value={sub.hasAccess ? formatDate(sub.endsAt) : '—'} />
        <StatCard label="Espectadores" value={t.counts.viewers} hint={`${t.counts.profiles} perfis`} />
        <StatCard label="Servidores" value={t.counts.servers} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Responsável">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-fg/60">Nome</dt><dd>{t.owner.name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg/60">E-mail</dt><dd className="break-all">{t.owner.email}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg/60">Conta</dt><dd>{t.owner.status === 'active' ? 'Ativa' : t.owner.status}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg/60">Último acesso</dt><dd>{t.owner.lastLoginAt ? formatDateTime(t.owner.lastLoginAt) : 'Nunca'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg/60">Teste até</dt><dd>{formatDateTime(sub.trial.endsAt)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg/60">Plano até</dt><dd>{formatDateTime(sub.plan.endsAt)}</dd></div>
          </dl>
        </Card>
        <Card title="Pagamentos">
          {t.payments.length === 0 ? <p className="text-sm text-fg/50">Nenhum pagamento.</p> : (
            <ul className="divide-y divide-fg/10 text-sm">
              {t.payments.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span>{formatMoney(p.amountCents)} <span className="text-xs text-fg/50">· {p.method} · {p.mode} · {formatDate(p.createdAt)}</span></span>
                  <StatusBadge map={PAYMENT_STATUS} value={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Auditoria recente" className="mt-6">
        {t.audit.length === 0 ? <p className="text-sm text-fg/50">Nada registrado.</p> : (
          <ul className="divide-y divide-fg/10 text-sm">
            {t.audit.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><code className="text-xs">{a.action}</code> {a.result !== 'success' && <span className="text-xs text-red-300">({a.result})</span>} {a.reason && <span className="text-xs text-fg/50">— {a.reason}</span>}</span>
                <span className="text-xs text-fg/50">{a.actorRole ?? 'sistema'} · {formatDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ReasonDialog open={dialog === 'suspend'} title="Suspender assinante" label="Motivo da suspensão" minHint="Mínimo de 5 caracteres." confirmLabel="Suspender" onClose={() => setDialog(null)} onSubmit={({ reason }) => act(() => masterService.suspend(t.id, reason), 'Assinante suspenso.')} />
      <ReasonDialog open={dialog === 'grant'} title="Conceder dias de acesso" extra="days" label="Justificativa" minHint="Mínimo de 10 caracteres." confirmLabel="Conceder" onClose={() => setDialog(null)} onSubmit={({ reason, days }) => act(() => masterService.grantDays(t.id, days, reason), `${days} dia(s) concedido(s).`)} />
      <EditDialog open={dialog === 'edit'} tenant={t} onClose={() => setDialog(null)} onSubmit={saveEdit} />
      <ReasonDialog open={dialog === 'delete'} title="Excluir assinante" label="Motivo da exclusão" minHint="Mínimo de 5 caracteres. Ação irreversível: os dados do responsável serão anonimizados." confirmLabel="Excluir definitivamente" onClose={() => setDialog(null)} onSubmit={confirmDelete} />
      <ConfirmDialog open={reactivating} title="Reativar assinante?" message="O acesso volta conforme as datas de teste/plano. Se estiverem vencidas, a página continuará indisponível." confirmLabel="Reativar" onConfirm={reactivate} onCancel={() => setReactivating(false)} />
    </>
  );
}

export default function TenantDetailPage() {
  const { id } = useParams();
  const state = useAsync(() => masterService.tenant(id), [id]);
  return <AsyncView state={state}>{(data) => <Detail key={data.id} initial={data} />}</AsyncView>;
}
