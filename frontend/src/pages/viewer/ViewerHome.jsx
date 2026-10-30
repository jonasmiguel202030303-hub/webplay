import { Link } from 'react-router-dom';
import { Clapperboard } from 'lucide-react';
import Banner from '../../components/viewer/Banner.jsx';
import Carousel from '../../components/viewer/Carousel.jsx';
import CatalogError from '../../components/viewer/CatalogError.jsx';
import ContentCard from '../../components/viewer/ContentCard.jsx';
import { RailSkeleton } from '../../components/viewer/ContentGrid.jsx';
import { toContent } from '../../components/viewer/content.js';
import { Alert, EmptyState } from '../../components/ui/Feedback.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import LineStatus from '../../components/viewer/LineStatus.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';

export default function ViewerHome() {
  const { slug, tenant, profile, account, svc } = useViewer();
  useTitle(tenant.brand.displayName);
  const state = useAsync(() => svc.home(), [svc, profile.id]);

  if (state.loading && !state.data) return (<><Banner />{<RailSkeleton />}</>);
  if (state.error && !state.data) return (<><Banner /><CatalogError error={state.error} onRetry={state.reload} /></>);

  const { data } = state;
  const rails = data.rails.map((r) => ({ ...r, contents: r.items.map((i) => toContent(i, r.type, data.serverId)) }));
  const featured = rails.filter((r) => r.type !== 'live').flatMap((r) => r.contents.slice(0, 3)).filter((c) => c.icon).slice(0, 6);
  const cont = data.continueWatching.map((i) => toContent(i, 'vod', data.serverId));
  const favs = data.favorites.map((i) => toContent(i, i.contentType, data.serverId));
  const hist = data.history.map((i) => toContent(i, i.contentType, data.serverId));
  const empty = !rails.length && !cont.length && !favs.length;

  return (
    <>
      <Banner featured={featured} />
      <div className="space-y-6 py-6">
        {account && <div className="px-4 sm:px-6"><LineStatus account={account} compact /></div>}
        {data.warning && (
          <div className="px-4 sm:px-6"><Alert tone="warning" title="Parte do catálogo pode estar indisponível">{data.warning}</Alert></div>
        )}
        {empty && (
          <div className="px-4 sm:px-6">
            <EmptyState icon={Clapperboard} title="Nenhum conteúdo disponível ainda">
              A fonte de conteúdo não retornou itens. Tente novamente em instantes.
            </EmptyState>
          </div>
        )}
        {cont.length > 0 && (
          <Carousel title="Continuar assistindo">
            {cont.map((c) => <ContentCard key={c.streamId} content={c} />)}
          </Carousel>
        )}
        {favs.length > 0 && (
          <Carousel title="Meus favoritos" action={<Link to={`/${slug}/favoritos`} className="text-xs text-primary hover:underline">Ver todos</Link>}>
            {favs.map((c) => <ContentCard key={`${c.type}-${c.streamId}`} content={c} />)}
          </Carousel>
        )}
        {rails.map((r) => (
          <Carousel
            key={r.id}
            title={r.title}
            action={<Link to={`/${slug}/${r.type === 'live' ? 'canais' : r.type === 'series' ? 'series' : 'filmes'}?categoria=${encodeURIComponent(r.categoryId)}`} className="text-xs text-primary hover:underline">Ver mais</Link>}
          >
            {r.contents.map((c) => <ContentCard key={c.streamId} content={c} />)}
          </Carousel>
        ))}
        {hist.length > 0 && (
          <Carousel title="Assistidos recentemente" action={<Link to={`/${slug}/historico`} className="text-xs text-primary hover:underline">Histórico</Link>}>
            {hist.map((c) => <ContentCard key={`${c.type}-${c.streamId}`} content={c} />)}
          </Carousel>
        )}
      </div>
    </>
  );
}
