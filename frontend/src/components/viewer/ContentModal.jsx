import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Maximize2, Play, RotateCcw, Star, X } from 'lucide-react';
import PlayerFrame from './PlayerFrame.jsx';
import { contentRef, episodePath, formatClock, TYPE_LABEL, watchPath } from './content.js';
import { Spinner } from '../ui/Feedback.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { ContentModalContext } from './contentModalContext.js';

function useFavorite(content, initial) {
  const { svc } = useViewer();
  const toast = useToast();
  const [fav, setFav] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setFav(!!initial), [initial]);
  const toggle = async () => {
    setBusy(true);
    try {
      if (fav) await svc.removeFavorite(contentRef(content));
      else await svc.addFavorite(contentRef(content));
      setFav(!fav);
      toast.success(fav ? 'Removido dos favoritos.' : 'Adicionado aos favoritos.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return { fav, busy, toggle };
}

function FavButton({ content, initial }) {
  const { fav, busy, toggle } = useFavorite(content, initial);
  return (
    <button type="button" className={`btn ${fav ? 'btn-primary' : 'btn-secondary'}`} onClick={toggle} disabled={busy} aria-pressed={fav}>
      <Heart className={`h-4 w-4 ${fav ? 'fill-current' : ''}`} aria-hidden /> {fav ? 'Nos favoritos' : 'Favoritar'}
    </button>
  );
}

function Hero({ image, title, subtitle }) {
  return (
    <div className="relative h-[48vh] min-h-[260px] overflow-hidden bg-fg/10 sm:h-[56vh]">
      {image && <img src={image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-r from-bg/40 via-transparent to-transparent" aria-hidden />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 px-5 pb-5 sm:px-8">
        {subtitle && <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-fg/70">{subtitle}</p>}
        <h2 id="content-modal-title" className="max-w-2xl text-3xl font-extrabold leading-[1.05] drop-shadow-lg sm:text-5xl">{title}</h2>
      </div>
    </div>
  );
}

function Meta({ items }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg/70">{list.map((m, i) => <span key={i} className="inline-flex items-center gap-1">{m}</span>)}</p>;
}

const ratingNode = (r) => (r > 0 ? <><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />{Number(r).toFixed(1)}</> : null);

function InfoBlock({ d }) {
  if (!d) return null;
  return (
    <dl className="space-y-1.5 text-sm">
      {d.cast && <div><dt className="inline text-fg/50">Elenco: </dt><dd className="inline text-fg/80">{d.cast}</dd></div>}
      {d.director && <div><dt className="inline text-fg/50">Direção: </dt><dd className="inline text-fg/80">{d.director}</dd></div>}
      {d.genre && <div><dt className="inline text-fg/50">Gêneros: </dt><dd className="inline text-fg/80">{d.genre}</dd></div>}
    </dl>
  );
}

function MovieBody({ content, onClose }) {
  const { slug, svc } = useViewer();
  const state = useAsync(() => svc.details('vod', content.streamId, content.serverId), [svc, content.streamId, content.serverId]);
  const d = state.data?.details;
  const s = state.data?.stream;
  const canResume = content.positionSeconds > 10 && content.durationSeconds && content.positionSeconds < content.durationSeconds - 15;
  return (
    <>
      <Hero image={d?.backdrop || d?.cover || content.icon} title={content.name} subtitle={TYPE_LABEL.vod} />
      <div className="space-y-4 px-5 pb-6 pt-3 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={watchPath(slug, content, { resume: canResume })} onClick={onClose} className="btn btn-primary btn-lg font-bold">
            <Play className="h-5 w-5 fill-current" aria-hidden /> {canResume ? `Continuar de ${formatClock(content.positionSeconds)}` : 'Assistir'}
          </Link>
          {canResume && (
            <Link to={watchPath(slug, content, { restart: true })} onClick={onClose} className="btn btn-secondary"><RotateCcw className="h-4 w-4" aria-hidden /> Do início</Link>
          )}
          <FavButton content={content} initial={state.data?.favorite} />
        </div>
        <Meta items={[ratingNode(d?.rating ?? s?.rating ?? content.rating), s?.year ?? content.year, d?.duration, d?.releaseDate && !(s?.year ?? content.year) ? d.releaseDate : null]} />
        {state.loading && !state.data ? <Spinner label="Carregando detalhes…" className="py-4" /> : (
          <>
            {d?.plot ? <p className="text-sm leading-relaxed text-fg/85">{d.plot}</p> : <p className="text-sm text-fg/50">Sinopse não disponível na fonte.</p>}
            <InfoBlock d={d} />
          </>
        )}
      </div>
    </>
  );
}

function SeriesBody({ content, onClose }) {
  const { slug, svc } = useViewer();
  const state = useAsync(() => svc.details('series', content.streamId, content.serverId), [svc, content.streamId, content.serverId]);
  const d = state.data?.details;
  const seasons = d?.seasons ?? [];
  const [season, setSeason] = useState(null);
  const current = seasons.find((x) => x.season === season) ?? seasons[0];
  const first = current?.episodes?.[0];
  const all = seasons.flatMap((x) => x.episodes.map((e) => ({ ...e, season: x.season })));
  const inProgress = content.episodeId ? all.find((e) => String(e.id) === String(content.episodeId)) : null;
  const canResume = !!inProgress && content.positionSeconds > 10;
  return (
    <>
      <Hero image={d?.backdrop || d?.cover || content.icon} title={content.name} subtitle={TYPE_LABEL.series} />
      <div className="space-y-4 px-5 pb-6 pt-3 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {canResume && (
            <Link to={`${episodePath(slug, { serverId: content.serverId, seriesId: content.streamId, episodeId: inProgress.id, ext: inProgress.extension })}&retomar=1`} onClick={onClose} className="btn btn-primary btn-lg font-bold">
              <Play className="h-5 w-5 fill-current" aria-hidden /> Continuar T{inProgress.season}:E{inProgress.number ?? 1} de {formatClock(content.positionSeconds)}
            </Link>
          )}
          {first && (
            <Link to={episodePath(slug, { serverId: content.serverId, seriesId: content.streamId, episodeId: first.id, ext: first.extension })} onClick={onClose} className={`btn btn-lg font-bold ${canResume ? 'btn-secondary' : 'btn-primary'}`}>
              <Play className="h-5 w-5 fill-current" aria-hidden /> Assistir T{current.season}:E{first.number ?? 1}
            </Link>
          )}
          <FavButton content={content} initial={state.data?.favorite} />
        </div>
        <Meta items={[ratingNode(d?.rating ?? content.rating), state.data?.stream?.year ?? content.year, seasons.length ? `${seasons.length} temporada${seasons.length > 1 ? 's' : ''}` : null]} />
        {state.loading && !state.data ? <Spinner label="Carregando temporadas…" className="py-4" /> : (
          <>
            {d?.plot && <p className="text-sm leading-relaxed text-fg/85">{d.plot}</p>}
            <InfoBlock d={d} />
            {state.error && !state.data && <p className="text-sm text-red-300" role="alert">{state.error.message}</p>}
            {seasons.length === 0 && state.data && <p className="text-sm text-fg/50">Esta série ainda não tem episódios disponíveis na fonte.</p>}
            {seasons.length > 0 && (
              <section aria-label="Episódios">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Episódios</h3>
                  <select className="input !w-auto" aria-label="Temporada" value={current?.season ?? ''} onChange={(e) => setSeason(Number(e.target.value))}>
                    {seasons.map((x) => <option key={x.season} value={x.season}>Temporada {x.season}</option>)}
                  </select>
                </div>
                <ol className="divide-y divide-fg/10 overflow-hidden rounded-lg border border-fg/10">
                  {current.episodes.map((ep, i) => (
                    <li key={ep.id}>
                      <Link
                        to={episodePath(slug, { serverId: content.serverId, seriesId: content.streamId, episodeId: ep.id, ext: ep.extension })}
                        onClick={onClose}
                        className="group flex items-start gap-3 px-3 py-2.5 transition hover:bg-fg/10"
                      >
                        <span className="w-6 shrink-0 pt-0.5 text-center text-lg font-semibold text-fg/50">{ep.number ?? i + 1}</span>
                        {ep.image && <img src={ep.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="hidden h-14 w-24 shrink-0 rounded object-cover transition group-hover:brightness-110 sm:block" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium group-hover:text-fg">{ep.title}</span>{ep.duration && <span className="shrink-0 text-xs text-fg/50">{ep.duration}</span>}</span>
                          {ep.plot && <span className="mt-0.5 line-clamp-2 block text-xs text-fg/60">{ep.plot}</span>}
                        </span>
                        <Play className="mt-1 h-4 w-4 shrink-0 text-fg/40 transition group-hover:text-fg" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

function LiveBody({ content, onClose }) {
  const { svc } = useViewer();
  const play = useAsync(() => svc.play('live', content.streamId, content.serverId), [svc, content.streamId, content.serverId]);
  const epg = useAsync(() => svc.epg(content.streamId, content.serverId), [svc, content.streamId, content.serverId]);
  const playerRef = useRef(null);
  const now = Date.now();
  const items = (epg.data?.items ?? []).filter((e) => !e.end || new Date(e.end).getTime() > now);
  return (
    <>
      <div className="bg-black">
        {play.error && !play.data ? (
          <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-red-300" role="alert">{play.error.message}</div>
        ) : play.data ? (
          <PlayerFrame ref={playerRef} play={play.data} live title={content.name} />
        ) : (
          <div className="flex aspect-video items-center justify-center"><Spinner label="Conectando ao canal…" /></div>
        )}
      </div>
      <div className="space-y-4 px-5 pb-6 pt-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg/60"><span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Ao vivo</span> {TYPE_LABEL.live}</p>
            <h2 id="content-modal-title" className="mt-1 truncate text-xl font-bold sm:text-2xl">{content.name}</h2>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => playerRef.current?.requestFullscreen()} disabled={!play.data} className="btn btn-secondary"><Maximize2 className="h-4 w-4" aria-hidden /> Tela cheia</button>
            <FavButton content={content} initial={play.data?.favorite} />
          </div>
        </div>
        <section aria-label="Programação">
          <h3 className="mb-2 text-sm font-semibold text-fg/80">Programação</h3>
          {epg.loading && !epg.data ? <Spinner className="py-2" /> : items.length === 0 ? (
            <p className="text-sm text-fg/50">Programação não disponível para este canal.</p>
          ) : (
            <ul className="divide-y divide-fg/10 overflow-hidden rounded-lg border border-fg/10 text-sm">
              {items.map((e, i) => (
                <li key={i} className="flex gap-3 px-3 py-2">
                  <span className="w-24 shrink-0 text-xs text-fg/50">{fmtTime(e.start)}{e.end ? ` – ${fmtTime(e.end)}` : ''}</span>
                  <span className="min-w-0"><span className="block truncate font-medium">{e.title}</span>{e.description && <span className="line-clamp-2 block text-xs text-fg/60">{e.description}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function ContentModal({ content, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const Body = content.type === 'live' ? LiveBody : content.type === 'series' ? SeriesBody : MovieBody;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-0 backdrop-blur-sm sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="content-modal-title" className="relative my-0 w-full max-w-[920px] animate-fade-in overflow-hidden bg-bg text-fg shadow-2xl sm:my-4 sm:rounded-lg">
        <button type="button" onClick={onClose} aria-label="Fechar" className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black" autoFocus>
          <X className="h-5 w-5" />
        </button>
        <Body key={`${content.type}-${content.streamId}`} content={content} onClose={onClose} />
      </div>
    </div>
  );
}

/** Provedor do modal de conteúdo: qualquer cartão chama useContentModal().open(conteudo). */
export function ContentModalProvider({ children }) {
  const [content, setContent] = useState(null);
  const close = useCallback(() => setContent(null), []);
  const value = useMemo(() => ({ open: setContent, close }), [close]);
  return (
    <ContentModalContext.Provider value={value}>
      {children}
      {content && <ContentModal content={content} onClose={close} />}
    </ContentModalContext.Provider>
  );
}
