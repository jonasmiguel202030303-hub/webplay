import { useState } from 'react';
import { CheckCircle2, Database, Pencil, Plus, Star, Trash2, Wifi } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { AsyncView, Alert, EmptyState } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { tenantService } from '../../services/tenantService.js';
import { fieldErrors } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

const STATUS = {
  online: { label: 'Online', tone: 'green' },
  offline: { label: 'Fora do ar', tone: 'red' },
  auth_failed: { label: 'Credenciais inválidas', tone: 'red' },
  error: { label: 'Erro', tone: 'red' },
  unknown: { label: 'Não testado', tone: 'slate' },
};

const EMPTY = { name: '', url: '' };

function ServerForm({ open, server, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!server;
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Reinicia o formulário sempre que o modal abre
  const [lastKey, setLastKey] = useState(null);
  const key = open ? (server?.id ?? 'new') : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setForm(server ? { name: server.name, url: server.url } : EMPTY);
      setErrors({});
      setTestResult(null);
    }
  }

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setTestResult(null);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    setErrors({});
    try {
      const data = await tenantService.testConnection({ url: form.url });
      setTestResult({ ok: true, probe: data.probe });
    } catch (err) {
      setErrors(fieldErrors(err));
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      if (editing) await tenantService.updateServer(server.id, form);
      else await tenantService.createServer(form);
      toast.success(editing ? 'Servidor atualizado.' : 'Servidor adicionado.');
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar servidor' : 'Adicionar servidor'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="server-form" loading={busy}>{editing ? 'Salvar' : 'Adicionar'}</Button>
        </>
      }
    >
      <form id="server-form" onSubmit={submit} className="space-y-4" noValidate autoComplete="off">
        <Field label="Nome" required value={form.name} onChange={set('name')} error={errors.name} placeholder="Ex.: Servidor principal" />
        <Field label="DNS do servidor" required value={form.url} onChange={set('url')} error={errors.url} placeholder="http://exemplo.com:8080" hint="Endereço base do painel Xtream Codes, sem /player_api.php. Usuário e senha são do próprio cliente, informados por ele ao entrar." />
        <div>
          <Button variant="secondary" icon={Wifi} loading={testing} onClick={test} disabled={!form.url}>Testar DNS</Button>
          {testResult?.ok && <Alert tone="success" className="mt-3">DNS respondendo{testResult.probe?.looksLikeXtream ? '.' : ', mas não parece um painel Xtream Codes.'}</Alert>}
          {testResult && !testResult.ok && <Alert tone="error" className="mt-3">{testResult.message}</Alert>}
        </div>
      </form>
    </Modal>
  );
}

function ServerCard({ server, onEdit, onChanged, onDelete }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  const run = async (name, fn, okMessage) => {
    setBusy(name);
    try {
      const res = await fn();
      if (okMessage) toast.success(typeof okMessage === 'function' ? okMessage(res) : okMessage);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{server.name}</h3>
            {server.isDefault && <Badge tone="blue">Padrão</Badge>}
            <Badge tone={(STATUS[server.status] ?? STATUS.unknown).tone}>{(STATUS[server.status] ?? STATUS.unknown).label}</Badge>
          </div>
          <p className="mt-1 truncate text-sm text-fg/60">{server.url}</p>
          {server.statusMessage && <p className="mt-1 text-xs text-fg/60">{server.statusMessage}</p>}
          <p className="mt-1 text-xs text-fg/50">Última verificação: {formatDateTime(server.lastCheckedAt)}</p>
          {server.hasCredentials && <p className="text-xs text-amber-400">Contém usuário/senha do modelo antigo. Salve o servidor novamente para removê-los.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={CheckCircle2} loading={busy === 'test'} onClick={() => run('test', () => tenantService.testServer(server.id), 'DNS respondendo.')}>Testar DNS</Button>
          {!server.isDefault && <Button size="sm" variant="ghost" icon={Star} loading={busy === 'default'} onClick={() => run('default', () => tenantService.defaultServer(server.id), 'Servidor definido como padrão.')}>Tornar padrão</Button>}
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(server)}>Editar</Button>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onDelete(server)} aria-label={`Remover ${server.name}`}>Remover</Button>
        </div>
      </div>
    </Card>
  );
}

export default function ServersPage() {
  useTitle('Servidores — Painel');
  const toast = useToast();
  const state = useAsync(() => tenantService.servers(), []);
  const [form, setForm] = useState({ open: false, server: null });
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await tenantService.deleteServer(toDelete.id);
      toast.success('Servidor removido.');
      setToDelete(null);
      state.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Servidores de conteúdo"
        description="Informe apenas a DNS do seu painel Xtream Codes. O cliente entra com o próprio usuário e senha, e a linha dele é conferida no servidor em tempo real (status, vencimento e EPG)."
        actions={<Button icon={Plus} onClick={() => setForm({ open: true, server: null })}>Adicionar servidor</Button>}
      />
      <Alert tone="info" className="mb-4">
        Utilize apenas fontes que você tem direito de distribuir. A WebPlay Brasil é uma plataforma de personalização e não fornece nem hospeda conteúdo.
      </Alert>
      <AsyncView state={state}>
        {({ servers }) =>
          servers.length === 0 ? (
            <EmptyState icon={Database} title="Nenhum servidor conectado" action={<Button icon={Plus} onClick={() => setForm({ open: true, server: null })}>Adicionar servidor</Button>}>
              Adicione um servidor para que seus espectadores vejam canais e filmes.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {servers.map((s) => <ServerCard key={s.id} server={s} onEdit={(server) => setForm({ open: true, server })} onChanged={state.reload} onDelete={setToDelete} />)}
            </div>
          )
        }
      </AsyncView>

      <ServerForm
        open={form.open}
        server={form.server}
        onClose={() => setForm({ open: false, server: null })}
        onSaved={() => {
          setForm({ open: false, server: null });
          state.reload();
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Remover servidor?"
        message={`Remover "${toDelete?.name}" apaga também favoritos, histórico e progresso dos espectadores ligados a ele. Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
