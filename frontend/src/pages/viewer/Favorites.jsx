import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import CatalogError from '../../components/viewer/CatalogError.jsx';
import ContentGrid from '../../components/viewer/ContentGrid.jsx';
import { toContent } from '../../components/viewer/content.js';
import { EmptyState, Spinner } from '../../components/ui/Feedback.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';

export default function Favorites() {
  const { slug, tenant, profile, svc } = useViewer();
  useTitle(`Favoritos — ${tenant.brand.displayName}`);
  const state = useAsync(() => svc.favorites(), [svc, profile.id]);

  const items = state.data?.items.map((i) => toContent(i, i.contentType)) ?? [];
  const live = items.filter((c) => c.type === 'live');
  const vod = items.filter((c) => c.type === 'vod');
  const series = items.filter((c) => c.type === 'series');

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">Favoritos</h1>
      {state.loading && !state.data ? (
        <Spinner />
      ) : state.error && !state.data ? (
        <CatalogError error={state.error} onRetry={state.reload} />
      ) : !items.length ? (
        <EmptyState icon={Heart} title="Você ainda não tem favoritos" action={<Link to={`/${slug}`} className="btn btn-primary">Explorar conteúdos</Link>}>
          Abra um canal, filme ou série e toque em “Favoritar” para guardá-lo aqui.
        </EmptyState>
      ) : (
        <>
          {live.length > 0 && <section aria-label="Canais favoritos"><h2 className="mb-3 text-lg font-semibold">Canais</h2><ContentGrid items={live} live /></section>}
          {vod.length > 0 && <section aria-label="Filmes favoritos"><h2 className="mb-3 text-lg font-semibold">Filmes</h2><ContentGrid items={vod} /></section>}
          {series.length > 0 && <section aria-label="Séries favoritas"><h2 className="mb-3 text-lg font-semibold">Séries</h2><ContentGrid items={series} /></section>}
        </>
      )}
    </div>
  );
}
