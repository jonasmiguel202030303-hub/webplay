import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Trash2 } from 'lucide-react';
import CatalogError from '../../components/viewer/CatalogError.jsx';
import ContentGrid from '../../components/viewer/ContentGrid.jsx';
import { toContent } from '../../components/viewer/content.js';
import Button from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { EmptyState, Spinner } from '../../components/ui/Feedback.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';

export default function History() {
  const { slug, tenant, profile, svc } = useViewer();
  useTitle(`Histórico — ${tenant.brand.displayName}`);
  const toast = useToast();
  const state = useAsync(() => svc.history(), [svc, profile.id]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const items = state.data?.items.map((i) => toContent(i, i.contentType)) ?? [];

  const clear = async () => {
    setBusy(true);
    try {
      await svc.clearHistory();
      state.setData({ items: [] });
      toast.success('Histórico limpo.');
      setConfirm(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Histórico</h1>
        {items.length > 0 && <Button variant="secondary" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>Limpar histórico</Button>}
      </div>
      {state.loading && !state.data ? (
        <Spinner />
      ) : state.error && !state.data ? (
        <CatalogError error={state.error} onRetry={state.reload} />
      ) : !items.length ? (
        <EmptyState icon={Clock} title="Seu histórico está vazio" action={<Link to={`/${slug}`} className="btn btn-primary">Explorar conteúdos</Link>}>
          Os conteúdos que você assistir aparecerão aqui.
        </EmptyState>
      ) : (
        <ContentGrid items={items} />
      )}
      <ConfirmDialog open={confirm} title="Limpar histórico" message={`Apagar todo o histórico do perfil "${profile.name}"?`} confirmLabel="Limpar" danger loading={busy} onConfirm={clear} onCancel={() => setConfirm(false)} />
    </div>
  );
}
