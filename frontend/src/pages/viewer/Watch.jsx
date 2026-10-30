import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Heart, Play, RotateCcw, SkipForward } from 'lucide-react';
import CatalogError from '../../components/viewer/CatalogError.jsx';
import PlayerFrame from '../../components/viewer/PlayerFrame.jsx';
import { contentRef, episodePath, formatClock } from '../../components/viewer/content.js';
import Button from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Feedback.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

function EpgList({ streamId, serverId }) {
  const { svc } = useViewer();
  const epg = useAsync(() => svc.epg(streamId, serverId), [svc, streamId, serverId]);
  const now = Date.now();
  const items = (epg.data?.items ?? []).filter((e) => !e.end || new Date(e.end).getTime() > now);
  return (
    <section aria-label="Programação" className="mt-6 px-4 sm:px-0">
      <h2 className="mb-2 text-sm font-semibold text-fg/80">Programação</h2>
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
  );
}

function Episodes({ details, seriesId, serverId, currentId }) {
  const { slug } = useViewer();
  const seasons = details?.seasons ?? [];
  const currentSeason = seasons.find((s) => s.episodes.some((e) => e.id === currentId))?.season ?? seasons[0]?.season;
  const [season, setSeason] = useState(currentSeason);
  useEffect(() => setSeason(currentSeason), [currentSeason]);
  const list = seasons.find((s) => s.season === season) ?? seasons[0];
  if (!list) return null;
  return (
    <section aria-label="Episódios" className="mt-6 px-4 sm:px-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Episódios</h2>
        <select className="input !w-auto" aria-label="Temporada" value={list.season} onChange={(e) => setSeason(Number(e.target.value))}>
          {seasons.map((s) => <option key={s.season} value={s.season}>Temporada {s.season}</option>)}
        </select>
      </div>
      <ol className="divide-y divide-fg/10 overflow-hidden rounded-lg border border-fg/10">
        {list.episodes.map((ep, i) => (
          <li key={ep.id}>
            <Link
              to={episodePath(slug, { serverId, seriesId, episodeId: ep.id, ext: ep.extension })}
              replace
              aria-current={ep.id === currentId ? 'true' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-fg/10 ${ep.id === currentId ? 'bg-primary/15' : ''}`}
            >
              <span className="w-6 shrink-0 text-center font-semibold text-fg/50">{ep.number ?? i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{ep.title}</span>
              {ep.duration && <span className="shrink-0 text-xs text-fg/50">{ep.duration}</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Watch() {
  const { type, streamId } = useParams();
  const [params] = useSearchParams();
  const serverId = params.get('server') || undefined;
  const episodeId = params.get('ep') || undefined;
  const ext = params.get('ext') || undefined;
  const restart = params.get('inicio') === '1';
  const resumeParam = params.get('retomar') === '1';
  const { slug, profile, svc, tenant } = useViewer();
  const navigate = useNavigate();
  const toast = useToast();
  const [fav, setFav] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const videoEl = useRef(null);

  // Estado da tela por episódio: escolha (continuar/recomeçar), abertura pulada, aviso do próximo descartado e posição atual.
  const epKey = `${streamId}:${episodeId ?? ''}`;
  const [ui, setUi] = useState({ key: epKey, decision: null, introDone: false, nextDismissed: false, t: 0, d: 0 });
  const cur = ui.key === epKey ? ui : { key: epKey, decision: null, introDone: false, nextDismissed: false, t: 0, d: 0 };
  const patch = (p) => setUi((prev) => ({ ...(prev.key === epKey ? prev : cur), ...p }));

  const isSeries = type === 'series';
  const state = useAsync(
    () => (isSeries ? svc.playEpisode(streamId, episodeId, ext, serverId) : svc.play(type, streamId, serverId)),
    [svc, type, streamId, episodeId, ext, serverId, profile.id],
  );
  const play = state.data && String(state.data.stream.id) === streamId ? state.data : null;
  const seriesInfo = useAsync(() => (isSeries ? svc.details('series', streamId, serverId) : Promise.resolve(null)), [svc, isSeries, streamId, serverId]);
  useTitle(play ? `${play.stream.name} — ${tenant.brand.displayName}` : tenant.brand.displayName);

  useEffect(() => {
    if (isSeries) setFav(!!seriesInfo.data?.favorite);
    else if (play) setFav(!!play.favorite);
  }, [play, isSeries, seriesInfo.data]);

  const ref = useRef(null);
  ref.current = play ? { ...contentRef({ serverId: play.serverId, type, streamId, name: play.stream.name, icon: play.stream.icon }), ...(isSeries && episodeId ? { episodeId } : {}) } : null;

  const onProgress = useCallback(
    (positionSeconds, durationSeconds, final) => {
      if ((type !== 'vod' && !(type === 'series' && episodeId)) || !ref.current || positionSeconds < 5) return;
      svc.saveProgress({ ...ref.current, positionSeconds, durationSeconds }, final ? { keepalive: true } : undefined).catch(() => {});
    },
    [svc, type, episodeId],
  );

  const toggleFav = async () => {
    setFavBusy(true);
    try {
      if (fav) await svc.removeFavorite(ref.current);
      else await svc.addFavorite(ref.current);
      setFav(!fav);
      toast.success(fav ? 'Removido dos favoritos.' : 'Adicionado aos favoritos.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setFavBusy(false);
    }
  };

  // Episódio atual e próximo (para o botão "Próximo episódio").
  const flat = useMemo(() => (seriesInfo.data?.details?.seasons ?? []).flatMap((s) => s.episodes.map((e) => ({ ...e, season: s.season }))), [seriesInfo.data]);
  const idx = flat.findIndex((e) => e.id === episodeId);
  const current = idx >= 0 ? flat[idx] : null;
  const nextEp = idx >= 0 ? flat[idx + 1] : null;
  const goNext = () => nextEp && navigate(episodePath(slug, { serverId, seriesId: streamId, episodeId: nextEp.id, ext: nextEp.extension }), { replace: true });

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(`/${slug}`));
  const live = type === 'live';
  const prog = play?.progress;
  const hasProgress = !live && !!prog && !prog.completed && prog.positionSeconds > 10 && (!prog.durationSeconds || prog.positionSeconds < prog.durationSeconds - 15);
  const choice = cur.decision ?? (restart ? 'restart' : resumeParam ? 'resume' : null);
  const needsChoice = hasProgress && !choice;
  const startAt = hasProgress && choice === 'resume' ? prog.positionSeconds : 0;
  const label = live ? 'Ao vivo' : isSeries ? 'Série' : 'Filme';

  const INTRO_SKIP_SECONDS = 85;
  const showIntro = isSeries && !cur.introDone && cur.t >= 3 && cur.t <= 150;
  const showNext = isSeries && !!nextEp && !cur.nextDismissed && cur.d > 0 && cur.d - cur.t <= 30;
  const skipIntro = () => {
    const v = videoEl.current;
    if (v) v.currentTime = Math.min(v.currentTime + INTRO_SKIP_SECONDS, (Number.isFinite(v.duration) ? v.duration : Infinity) - 5);
    patch({ introDone: true });
  };
  const overlay = isSeries ? (
    <>
      {showIntro && (
        <button type="button" onClick={skipIntro} className="absolute bottom-16 right-4 z-10 rounded border border-white/60 bg-black/70 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white hover:text-black">
          Pular abertura
        </button>
      )}
      {showNext && (
        <div className="absolute bottom-16 right-4 z-10 flex items-center gap-2 rounded-lg border border-white/20 bg-black/80 p-2 text-white backdrop-blur">
          <button type="button" onClick={goNext} className="flex items-center gap-2 rounded bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/80">
            <SkipForward className="h-4 w-4" aria-hidden /> Próximo episódio
          </button>
          <button type="button" onClick={() => patch({ nextDismissed: true })} className="rounded px-3 py-2 text-sm text-white/80 hover:bg-white/15">Ver créditos</button>
        </div>
      )}
    </>
  ) : null;

  return (
    <div className="px-0 pb-8 sm:px-6 sm:pt-4">
      <div className="flex items-center gap-2 px-4 py-3 sm:px-0">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={back}>Voltar</Button>
      </div>

      {state.loading && !play ? (
        <Spinner label="Preparando reprodução…" className="py-24" />
      ) : state.error && !play ? (
        <CatalogError error={state.error} onRetry={state.reload} />
      ) : (
        play && (
          <>
            <div className="mx-auto max-h-[75vh] w-full overflow-hidden bg-black sm:rounded-xl">
              {needsChoice ? (
                <div className="flex aspect-video max-h-[75vh] w-full flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
                  <p className="text-lg font-semibold sm:text-2xl">{play.stream.name}</p>
                  {current && <p className="text-sm text-white/70">T{current.season}:E{current.number ?? idx + 1} — {current.title}</p>}
                  <p className="text-sm text-white/70">Você parou em {formatClock(prog.positionSeconds)}{prog.durationSeconds ? ` de ${formatClock(prog.durationSeconds)}` : ''}.</p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button icon={Play} onClick={() => patch({ decision: 'resume' })}>Continuar de {formatClock(prog.positionSeconds)}</Button>
                    <Button variant="secondary" icon={RotateCcw} onClick={() => patch({ decision: 'restart' })}>Começar do início</Button>
                  </div>
                </div>
              ) : (
                <PlayerFrame
                  key={`${streamId}-${episodeId}`}
                  play={play}
                  live={live}
                  startAt={startAt}
                  title={play.stream.name}
                  onProgress={onProgress}
                  onReady={(video) => { videoEl.current = video; }}
                  onTimeUpdate={(t, d) => patch({ t, d })}
                  onEnded={() => { if (nextEp && !cur.nextDismissed) goNext(); }}
                  className="max-h-[75vh]"
                >
                  {overlay}
                </PlayerFrame>
              )}
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-0">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold sm:text-2xl">{play.stream.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg/60">
                  {live ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Ao vivo</span> : <span>{label}</span>}
                  {current && <span>T{current.season}:E{current.number ?? idx + 1} — {current.title}</span>}
                  {play.stream.year && <span>{play.stream.year}</span>}
                  {startAt > 10 && <span>Retomando de onde você parou</span>}
                </p>
              </div>
              <div className="flex gap-2">
                {nextEp && <Button variant="secondary" icon={SkipForward} onClick={goNext}>Próximo episódio</Button>}
                <Button variant={fav ? 'primary' : 'secondary'} icon={Heart} loading={favBusy} onClick={toggleFav} aria-pressed={fav}>
                  {fav ? 'Favoritado' : 'Favoritar'}
                </Button>
              </div>
            </div>

            {live && <EpgList streamId={streamId} serverId={play.serverId} />}
            {isSeries && <Episodes details={seriesInfo.data?.details} seriesId={streamId} serverId={play.serverId} currentId={episodeId} />}

            <p className="px-4 pt-6 text-xs text-fg/40 sm:px-0">
              O conteúdo é fornecido pela fonte configurada pelo responsável desta plataforma. <Link to="/aviso-legal" className="underline">Aviso legal</Link>.
            </p>
          </>
        )
      )}
    </div>
  );
}
