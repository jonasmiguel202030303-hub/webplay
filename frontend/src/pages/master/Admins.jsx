import { useState } from 'react';
import { Pause, Play, UserPlus } from 'lucide-react';
import { PageHeader } from '../../components/ui/Card.jsx';
import { AsyncView } from '../../components/ui/Feedback.jsx';
import { Field, PasswordField } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { masterService } from '../../services/masterService.js';
import { fieldErrors } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

function CreateAdmin({ open, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res = await masterService.createAdmin(form);
      toast.success('Administrador criado.');
      setForm({ name: '', email: '', password: '' });
      onCreated(res.admins);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo administrador" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="admin-form" loading={busy}>Criar</Button></>}>
      <form id="admin-form" onSubmit={submit} className="space-y-4" noValidate autoComplete="off">
        <p className="text-sm text-fg/60">Administradores veem assinantes, pagamentos e auditoria, mas não alteram preços, credenciais do Mercado Pago, termos nem concedem dias.</p>
        <Field label="Nome" required value={form.name} onChange={set('name')} error={errors.name} />
        <Field label="E-mail" type="email" required value={form.email} onChange={set('email')} error={errors.email} />
        <PasswordField label="Senha inicial" required value={form.password} onChange={set('password')} error={errors.password} autoComplete="new-password" />
      </form>
    </Modal>
  );
}

function Admins({ initial }) {
  const toast = useToast();
  const [admins, setAdmins] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  const toggle = async (a) => {
    setBusy(a.id);
    try {
      const res = await masterService.setAdminStatus(a.id, a.status === 'active' ? 'suspended' : 'active');
      setAdmins(res.admins);
      toast.success(a.status === 'active' ? 'Administrador suspenso.' : 'Administrador reativado.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const columns = [
    { key: 'name', header: 'Nome', render: (a) => <div><p className="font-medium">{a.name}</p><p className="text-xs text-fg/50">{a.email}</p></div> },
    { key: 'role', header: 'Papel', render: (a) => <Badge tone={a.role === 'master' ? 'blue' : 'slate'}>{a.role === 'master' ? 'Master' : 'Administrador'}</Badge> },
    { key: 'status', header: 'Situação', render: (a) => <Badge tone={a.status === 'active' ? 'green' : 'amber'}>{a.status === 'active' ? 'Ativo' : 'Suspenso'}</Badge> },
    { key: 'last', header: 'Último acesso', render: (a) => (a.lastLoginAt ? formatDateTime(a.lastLoginAt) : 'Nunca') },
    {
      key: 'actions', header: 'Ações', className: 'text-right', render: (a) => a.role === 'admin' && (
        <Button size="sm" variant="ghost" icon={a.status === 'active' ? Pause : Play} loading={busy === a.id} onClick={() => toggle(a)}>{a.status === 'active' ? 'Suspender' : 'Reativar'}</Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Administradores" description="Equipe com acesso ao painel da plataforma." actions={<Button icon={UserPlus} onClick={() => setOpen(true)}>Novo administrador</Button>} />
      <DataTable columns={columns} rows={admins} caption="Administradores" />
      <CreateAdmin open={open} onClose={() => setOpen(false)} onCreated={(list) => { setAdmins(list); setOpen(false); }} />
    </>
  );
}

export default function AdminsPage() {
  useTitle('Administradores — Master');
  const state = useAsync(() => masterService.admins(), []);
  return <AsyncView state={state}>{({ admins }) => <Admins initial={admins} />}</AsyncView>;
}
