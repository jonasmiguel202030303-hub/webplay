import { useState } from 'react';
import { FilePlus } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { AsyncView, Alert } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { masterService } from '../../services/masterService.js';
import { fieldErrors } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

const DOCS = { terms: 'Termos de Uso', privacy: 'Política de Privacidade', legal: 'Aviso Legal' };
const EMPTY = { docType: 'terms', version: '', title: '', content: '' };

function PublishDialog({ open, onClose, onPublished }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await masterService.publishTerms(form);
      toast.success('Nova versão publicada. Ela é a vigente para novos aceites.');
      setForm(EMPTY);
      onPublished();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Publicar nova versão" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="terms-form" loading={busy}>Publicar</Button></>}>
      <form id="terms-form" onSubmit={submit} className="space-y-4" noValidate>
        <Alert tone="warning">Versões publicadas não podem ser editadas, apenas substituídas por uma nova versão. Os textos jurídicos devem ser revisados por um profissional antes da publicação.</Alert>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field as="select" label="Documento" value={form.docType} onChange={set('docType')}>
            {Object.entries(DOCS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Field>
          <Field label="Versão" required value={form.version} onChange={set('version')} error={errors.version} placeholder="2.0" />
          <Field label="Título" required value={form.title} onChange={set('title')} error={errors.title} />
        </div>
        <Field as="textarea" rows={12} label="Conteúdo (texto simples; linhas em branco separam parágrafos)" required value={form.content} onChange={set('content')} error={errors.content} hint="Mínimo de 50 caracteres." />
      </form>
    </Modal>
  );
}

export default function MasterTermsPage() {
  useTitle('Termos — Master');
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const state = useAsync(() => masterService.termsVersions(), []);
  return (
    <>
      <PageHeader title="Termos e privacidade" description="Versões publicadas dos documentos legais. Cada aceite guarda a versão aceita." actions={user?.role === 'master' && <Button icon={FilePlus} onClick={() => setOpen(true)}>Publicar nova versão</Button>} />
      <AsyncView state={state}>
        {({ versions }) =>
          Object.entries(DOCS).map(([type, label]) => (
            <Card key={type} title={label} className="mb-6">
              <ul className="divide-y divide-fg/10 text-sm">
                {versions.filter((v) => v.docType === type).map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>Versão {v.version} — {v.title} {v.isCurrent && <Badge tone="green">Vigente</Badge>}</span>
                    <span className="text-xs text-fg/50">{formatDateTime(v.publishedAt)}</span>
                  </li>
                ))}
                {versions.filter((v) => v.docType === type).length === 0 && <li className="py-2 text-fg/50">Nenhuma versão publicada.</li>}
              </ul>
            </Card>
          ))
        }
      </AsyncView>
      <PublishDialog open={open} onClose={() => setOpen(false)} onPublished={() => { setOpen(false); state.reload(); }} />
    </>
  );
}
