import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Cast, Crop, Loader2, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Settings, Volume1, Volume2, VolumeX } from 'lucide-react';
import { formatClock } from './content.js';
import { castMessage, castStart, pickCastSource } from '../../utils/cast.js';

const kindOf = (src) => (src.format === 'm3u8' || /\.m3u8(\?|$)/i.test(src.url) ? 'hls' : src.format === 'ts' || /\.ts(\?|$)/i.test(src.url) ? 'ts' : 'direct');

/**
 * Player de vídeo com cadeia de tentativas (como o player do WebPlay antigo):
 * recebe `sources` [{ url, format }] e tenta uma a uma — HLS via hls.js, MPEG-TS via mpegts.js e demais formatos
 * direto no <video> — até uma reproduzir. Só chama onError({ kind, detail }) quando todas falharem
 * (kind: mixed-content | unsupported | network | format | unknown).
 * onProgress(position, duration, final) é chamado a cada ~15 s, ao pausar e ao desmontar (só para não-live).
 * Ao vivo, quedas depois de começar a tocar (ou travadas) reconectam sozinhas antes de mostrar erro.
 * onTimeUpdate(position, duration) ~1x/s e onEnded() são para não-live; onReady(video) entrega o elemento <video>.
 */
const MAX_LIVE_RETRIES = 8;

export default function Player({ sources, live = false, startAt = 0, title, autoPlay = true, fs = false, onToggleFs, onError, onProgress, onReady, onTimeUpdate, onEnded }) {
  const videoRef = useRef(null);
  const cbRef = useRef({});
  cbRef.current = { onError, onProgress, onReady, onTimeUpdate, onEnded };
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1);
  const [menu, setMenu] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const hlsRef = useRef(null);
  const sourcesKey = (sources || []).map((s) => s.url).join('|');
  const wrapRef = useRef(null);
  const barRef = useRef(null);
  const hideTimer = useRef(null);
  const pointerType = useRef('mouse');
  const hovering = useRef(false);
  const latest = useRef({});
  latest.current = { fs, onToggleFs, live };
  const [coarse] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
  const [ui, setUi] = useState({ paused: true, t: 0, d: 0, buffered: 0, waiting: true });
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fit, setFit] = useState(null);
  const [show, setShow] = useState(true);
  const [drag, setDrag] = useState(null);
  const [hover, setHover] = useState(null);
  const [castState, setCastState] = useState(null);
  const [castBusy, setCastBusy] = useState(false);
  const [castNote, setCastNote] = useState('');
  const castRef = useRef(null);
  const resumeRef = useRef(null);
  const casting = !!castState;

  useEffect(() => {
    if (!castNote) return undefined;
    const t = setTimeout(() => setCastNote(''), 6000);
    return () => clearTimeout(t);
  }, [castNote]);
  useEffect(() => () => { try { castRef.current?.stop(); } catch { /* ignora */ } }, []);

  const startCast = async () => {
    if (castBusy) return;
    const v = videoRef.current;
    setCastNote('');
    if (typeof v?.webkitShowPlaybackTargetPicker === 'function') { v.webkitShowPlaybackTargetPicker(); return; }
    const src = pickCastSource(sources);
    if (!src) { setCastNote(castMessage('no-source')); return; }
    setCastBusy(true);
    try {
      const handle = await castStart({ url: src.url, format: src.format, live, title, startAt: v?.currentTime ?? 0 });
      v?.pause();
      castRef.current = handle;
      setCastState({ device: handle.device, paused: false });
      handle.subscribe(({ paused, connected }) => {
        if (connected) { setCastState((s) => (s ? { ...s, paused } : s)); return; }
        resumeRef.current = live ? null : handle.lastTime();
        castRef.current = null;
        setCastState(null);
      });
    } catch (err) {
      if (err?.code !== 'cancel') setCastNote(castMessage(err?.code));
    } finally {
      setCastBusy(false);
    }
  };

  const poke = useCallback(() => {
    setShow(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShow(false), 3000);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const bufEnd = () => {
      const b = v.buffered;
      for (let i = 0; i < b.length; i += 1) if (b.start(i) <= v.currentTime + 0.5 && b.end(i) >= v.currentTime) return b.end(i);
      return 0;
    };
    const upd = (extra) => setUi((p) => ({ ...p, paused: v.paused, t: v.currentTime, d: Number.isFinite(v.duration) ? v.duration : 0, buffered: bufEnd(), ...extra }));
    const onVolume = () => { setVolume(v.volume); setMuted(v.muted); };
    const on = {
      play: () => upd(), pause: () => upd(), timeupdate: () => upd(), durationchange: () => upd(), progress: () => upd(), seeked: () => upd(),
      waiting: () => upd({ waiting: true }), loadstart: () => upd({ waiting: true }), playing: () => upd({ waiting: false }), canplay: () => upd({ waiting: false }),
      volumechange: onVolume,
    };
    for (const [n, h] of Object.entries(on)) v.addEventListener(n, h);
    onVolume();
    return () => { for (const [n, h] of Object.entries(on)) v.removeEventListener(n, h); };
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const seekTo = (sec) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(sec, v.duration - 0.1));
  };
  const skip = (delta) => { const v = videoRef.current; if (v) seekTo(v.currentTime + delta); };
  const setVol = (x) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, x));
    v.muted = v.volume === 0;
  };
  const toggleMute = () => { const v = videoRef.current; if (v) v.muted = !v.muted; };

  // Atalhos de teclado (só quando o player está em foco, com o mouse sobre ele ou em tela cheia).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const { fs: isFs, onToggleFs: toggleFs, live: isLive } = latest.current;
      const w = wrapRef.current;
      if (!w) return;
      if (e.key === 'Escape') {
        if (isFs) { e.preventDefault(); toggleFs?.(); }
        return;
      }
      if (!(isFs || hovering.current || w.contains(document.activeElement))) return;
      const v = videoRef.current;
      const k = e.key.toLowerCase();
      if (k === ' ' && t instanceof HTMLElement && t.tagName === 'BUTTON') return;
      if (k === ' ' || k === 'k') togglePlay();
      else if (k === 'f') toggleFs?.();
      else if (k === 'm') toggleMute();
      else if (k === 'arrowleft' && !isLive) skip(-10);
      else if (k === 'arrowright' && !isLive) skip(10);
      else if (k === 'arrowup' && v) setVol(v.volume + 0.1);
      else if (k === 'arrowdown' && v) setVol(v.volume - 0.1);
      else return;
      e.preventDefault();
      poke();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poke]);

  useEffect(() => {
    const video = videoRef.current;
    const list = (sources || []).filter((s) => s?.url);
    if (!video || list.length === 0 || casting) return undefined;
    const begin = resumeRef.current ?? startAt;
    let engine = null; // { destroy() }
    let cancelled = false;
    let failed = false;
    let index = 0;
    let lastFailure = null;
    let hasPlayed = false;
    let retries = 0;
    let restartTimer = null;
    let stableTimer = null;
    setLevels([]);
    setLevel(-1);
    setReconnecting(false);

    const finalFail = () => {
      if (cancelled || failed) return;
      failed = true;
      setReconnecting(false);
      cbRef.current.onError?.(lastFailure || { kind: 'unknown' });
    };
    const teardown = () => {
      try { engine?.destroy(); } catch { /* ignora */ }
      engine = null;
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
    const next = (kind, detail) => {
      if (cancelled || failed) return;
      lastFailure = { kind, detail };
      console.warn(`[player] fonte ${index + 1}/${list.length} (${list[index]?.format ?? '?'}) falhou: ${kind}${detail ? ` — ${detail}` : ''}`);
      clearTimeout(restartTimer);
      clearTimeout(stableTimer);
      teardown();
      if (live && kind !== 'mixed-content' && kind !== 'unsupported') {
        // Ao vivo: reconecta na mesma fonte se já estava tocando; senão tenta a próxima (voltando à primeira ao fim da lista).
        if (retries >= MAX_LIVE_RETRIES) { finalFail(); return; }
        retries += 1;
        const target = hasPlayed ? index : (index + 1) % list.length;
        hasPlayed = false;
        setReconnecting(true);
        restartTimer = setTimeout(() => {
          if (cancelled || failed) return;
          index = target;
          resumed = false;
          start();
        }, Math.min(1500 * retries, 8000));
        return;
      }
      index += 1;
      if (index < list.length) start();
      else finalFail();
    };

    const snapshot = (final) => {
      if (live || !Number.isFinite(video.duration) || video.duration <= 0) return;
      cbRef.current.onProgress?.(Math.floor(video.currentTime), Math.floor(video.duration), final);
    };
    let resumed = false;
    const onLoaded = () => {
      if (resumed) return;
      resumed = true;
      if (!live && begin > 10 && Number.isFinite(video.duration) && begin < video.duration - 15) video.currentTime = begin;
      resumeRef.current = null;
      cbRef.current.onReady?.(video);
    };
    const onPlaying = () => {
      onLoaded();
      hasPlayed = true;
      setReconnecting(false);
      clearTimeout(stableTimer);
      stableTimer = setTimeout(() => { retries = 0; }, 30000);
    };
    const onMediaError = () => {
      if (hlsRef.current || engine?.managed) return; // hls.js/mpegts.js tratam seus próprios erros
      const code = video.error?.code;
      next(code === 2 ? 'network' : code === 3 || code === 4 ? 'format' : 'unknown', `MediaError ${code}${video.error?.message ? `: ${video.error.message}` : ''}`);
    };
    const onPause = () => snapshot(false);
    let endedFired = false;
    const onEndedEvt = () => {
      snapshot(true);
      if (live) {
        // Fim de transmissão ao vivo = queda da fonte: reconecta.
        if (hasPlayed) next('network', 'transmissão encerrada pela fonte');
        return;
      }
      if (!endedFired) { endedFired = true; cbRef.current.onEnded?.(); }
    };
    let lastTick = -1;
    const onTime = () => {
      if (live) return;
      const t = Math.floor(video.currentTime);
      if (t === lastTick) return;
      lastTick = t;
      cbRef.current.onTimeUpdate?.(t, Number.isFinite(video.duration) ? Math.floor(video.duration) : 0);
    };
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onMediaError);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEndedEvt);
    video.addEventListener('timeupdate', onTime);
    const timer = setInterval(() => !video.paused && snapshot(false), 15000);
    // Ao vivo: se o vídeo não avança por ~15 s sem estar pausado, considera a conexão travada.
    let lastPos = -1;
    let frozen = 0;
    const watchdog = live ? setInterval(() => {
      if (!hasPlayed || video.paused || video.seeking) { frozen = 0; return; }
      if (video.currentTime === lastPos) frozen += 1; else { frozen = 0; lastPos = video.currentTime; }
      if (frozen >= 3) { frozen = 0; next('network', 'transmissão travada'); }
    }, 5000) : null;
    const tryPlay = () => { if (autoPlay) video.play().catch(() => {}); };

    // Se uma fonte "carregou" mas nunca começou a tocar, passa para a próxima.
    let stallTimer = null;
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (!cancelled && !failed && video.readyState < 2 && (live || index < list.length - 1)) next('network', 'timeout aguardando o início da reprodução');
      }, 25000);
    };

    function start() {
      const src = list[index];
      const kind = kindOf(src);
      armStall();
      if (window.location.protocol === 'https:' && src.url.startsWith('http:')) {
        next('mixed-content');
        return;
      }
      if (kind === 'hls') {
        import('hls.js')
          .then(({ default: Hls }) => {
            if (cancelled || failed) return;
            if (!Hls.isSupported()) {
              if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = src.url;
                tryPlay();
              } else {
                next('unsupported');
              }
              return;
            }
            const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
            hlsRef.current = hls;
            engine = { destroy: () => hls.destroy(), managed: true };
            let netRetries = 0;
            hls.on(Hls.Events.ERROR, (_e, data) => {
              if (!data.fatal) return;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 2) {
                netRetries += 1;
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && netRetries < 3) {
                netRetries += 1;
                hls.recoverMediaError();
              } else {
                next(data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'network' : 'format', `${data.type} / ${data.details}${data.error?.message ? `: ${data.error.message}` : ''}`);
              }
            });
            hls.on(Hls.Events.FRAG_LOADED, () => { netRetries = 0; });
            hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
              setLevels((data.levels || []).map((l, i) => ({ index: i, height: l.height, bitrate: l.bitrate })));
              tryPlay();
            });
            hls.loadSource(src.url);
            hls.attachMedia(video);
          })
          .catch(() => next('unknown'));
      } else if (kind === 'ts') {
        import('mpegts.js')
          .then(({ default: mpegts }) => {
            if (cancelled || failed) return;
            if (!mpegts.isSupported()) {
              next('unsupported');
              return;
            }
            const p = mpegts.createPlayer({ type: 'mpegts', isLive: live, url: src.url }, { enableWorker: true, liveBufferLatencyChasing: live, lazyLoadMaxDuration: 60 });
            engine = { destroy: () => { p.pause(); p.unload(); p.detachMediaElement(); p.destroy(); }, managed: true };
            p.on(mpegts.Events.ERROR, (type, detail) => next(type === mpegts.ErrorTypes.NETWORK_ERROR ? 'network' : 'format', `${type} / ${detail}`));
            p.attachMediaElement(video);
            p.load();
            if (autoPlay) Promise.resolve(p.play()).catch(() => {});
          })
          .catch(() => next('unknown'));
      } else {
        video.src = src.url;
        tryPlay();
      }
    }
    start();

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(watchdog);
      clearTimeout(stallTimer);
      clearTimeout(restartTimer);
      clearTimeout(stableTimer);
      snapshot(true);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onMediaError);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEndedEvt);
      video.removeEventListener('timeupdate', onTime);
      try { engine?.destroy(); } catch { /* ignora */ }
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey, live, startAt, autoPlay, casting]);

  const changeLevel = (i) => {
    setLevel(i);
    setMenu(false);
    if (hlsRef.current) hlsRef.current.currentLevel = i;
  };
  const levelLabel = (l) => (l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`);

  const visible = show || ui.paused || menu || drag !== null;
  const fitMode = fit ?? (fs && coarse ? 'cover' : 'contain');
  const frac = drag ?? (ui.d > 0 ? Math.min(1, ui.t / ui.d) : 0);
  const bufFrac = ui.d > 0 ? Math.min(1, ui.buffered / ui.d) : 0;
  const barEvent = (e) => {
    const r = barRef.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const bubble = drag ?? hover;
  const group = `transition-opacity duration-200 ${visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`;
  const iconBtn = 'flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/15 active:scale-95 sm:h-11 sm:w-11';
  const stop = (e) => { e.stopPropagation(); poke(); };

  return (
    <div
      ref={wrapRef}
      className={`relative h-full w-full select-none overflow-hidden bg-black ${visible ? '' : 'cursor-none'}`}
      onMouseEnter={() => { hovering.current = true; }}
      onMouseLeave={() => { hovering.current = false; if (!videoRef.current?.paused) setShow(false); }}
      onPointerMove={(e) => { if (e.pointerType === 'mouse') poke(); }}
    >
      <video ref={videoRef} className={`h-full w-full bg-black ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`} playsInline aria-label={title} />

      <div
        className="absolute inset-0"
        onPointerDown={(e) => { pointerType.current = e.pointerType; }}
        onClick={() => {
          if (pointerType.current === 'touch') {
            if (visible) { clearTimeout(hideTimer.current); setShow(false); } else poke();
          } else { togglePlay(); poke(); }
        }}
        onDoubleClick={() => { if (pointerType.current !== 'touch') onToggleFs?.(); }}
      />

      {reconnecting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white" role="status">
          Reconectando ao canal…
        </div>
      )}
      {ui.waiting && !ui.paused && !reconnecting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status" aria-label="Carregando">
          <Loader2 className="h-14 w-14 animate-spin text-white/90" aria-hidden />
        </div>
      )}

      {/* Barra superior */}
      {fs && (
        <div className={`absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pb-8 pt-3 sm:px-5 sm:pt-4 ${group}`} onClick={stop}>
          <button type="button" className={iconBtn} onClick={onToggleFs} aria-label="Sair da tela cheia"><ArrowLeft className="h-6 w-6" aria-hidden /></button>
          {title && <p className="min-w-0 flex-1 truncate text-base font-semibold text-white drop-shadow sm:text-lg">{title}</p>}
        </div>
      )}

      {/* Controles centrais */}
      {!(ui.waiting && !ui.paused) && !reconnecting && (
        <div className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-8 sm:gap-14 ${group}`}>
          {!live && ui.d > 0 && (
            <button type="button" className="pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full text-white transition hover:bg-white/15 active:scale-95 sm:h-14 sm:w-14" onClick={(e) => { stop(e); skip(-10); }} aria-label="Voltar 10 segundos">
              <RotateCcw className="h-full w-full" strokeWidth={1.6} aria-hidden />
              <span className="absolute text-[11px] font-bold sm:text-xs" aria-hidden>10</span>
            </button>
          )}
          <button type="button" className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white ring-2 ring-white/80 backdrop-blur-sm transition hover:scale-105 hover:bg-black/70 active:scale-95 sm:h-20 sm:w-20" onClick={(e) => { stop(e); togglePlay(); }} aria-label={ui.paused ? 'Reproduzir' : 'Pausar'}>
            {ui.paused ? <Play className="ml-1 h-9 w-9 fill-current sm:h-11 sm:w-11" aria-hidden /> : <Pause className="h-9 w-9 fill-current sm:h-11 sm:w-11" aria-hidden />}
          </button>
          {!live && ui.d > 0 && (
            <button type="button" className="pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full text-white transition hover:bg-white/15 active:scale-95 sm:h-14 sm:w-14" onClick={(e) => { stop(e); skip(10); }} aria-label="Avançar 10 segundos">
              <RotateCw className="h-full w-full" strokeWidth={1.6} aria-hidden />
              <span className="absolute text-[11px] font-bold sm:text-xs" aria-hidden>10</span>
            </button>
          )}
        </div>
      )}

      {/* Barra inferior */}
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-3 pt-12 sm:px-5 sm:pb-4 ${group}`} onClick={stop}>
        {!live && (
          <div
            ref={barRef}
            role="slider"
            tabIndex={0}
            aria-label="Progresso"
            aria-valuemin={0}
            aria-valuemax={Math.floor(ui.d)}
            aria-valuenow={Math.floor(ui.t)}
            aria-valuetext={`${formatClock(ui.t)} de ${formatClock(ui.d)}`}
            className="group/bar relative mb-2 flex h-9 w-full cursor-pointer touch-none items-center"
            onPointerDown={(e) => { if (!ui.d) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag(barEvent(e)); }}
            onPointerMove={(e) => { const f = barEvent(e); setHover(f); if (drag !== null) setDrag(f); }}
            onPointerUp={() => { if (drag !== null) { seekTo(drag * ui.d); setDrag(null); poke(); } }}
            onPointerCancel={() => setDrag(null)}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); skip(-5); } else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); skip(5); }
            }}
          >
            <div className={`relative w-full overflow-hidden rounded-full bg-white/30 transition-all ${drag !== null ? 'h-2.5' : 'h-1.5 group-hover/bar:h-2.5'}`}>
              <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${bufFrac * 100}%` }} />
              <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${frac * 100}%` }} />
            </div>
            <span
              className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-lg ring-2 ring-white transition-[width,height] ${drag !== null ? 'h-7 w-7' : 'h-5 w-5 group-hover/bar:h-6 group-hover/bar:w-6'}`}
              style={{ left: `${frac * 100}%` }}
              aria-hidden
            />
            {bubble !== null && ui.d > 0 && (
              <span className="pointer-events-none absolute -top-5 -translate-x-1/2 rounded bg-black/85 px-2 py-0.5 text-xs font-medium text-white" style={{ left: `${Math.min(97, Math.max(3, bubble * 100))}%` }}>
                {formatClock(bubble * ui.d)}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-white sm:gap-3">
          <button type="button" className={iconBtn} onClick={togglePlay} aria-label={ui.paused ? 'Reproduzir' : 'Pausar'}>
            {ui.paused ? <Play className="h-6 w-6 fill-current" aria-hidden /> : <Pause className="h-6 w-6 fill-current" aria-hidden />}
          </button>
          <div className="group/vol flex items-center">
            <button type="button" className={iconBtn} onClick={toggleMute} aria-label={muted ? 'Ativar som' : 'Silenciar'}><VolIcon className="h-6 w-6" aria-hidden /></button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => setVol(Number(e.target.value))}
              aria-label="Volume"
              className="ml-1 hidden h-1 w-0 cursor-pointer accent-white transition-all group-hover/vol:w-20 focus:w-20 sm:block"
            />
          </div>
          <div className="ml-1 text-sm font-medium tabular-nums">
            {live ? (
              <span className="inline-flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-xs font-bold uppercase">Ao vivo</span>
            ) : (
              <span>{formatClock(ui.t)} <span className="text-white/60">/ {formatClock(ui.d)}</span></span>
            )}
          </div>
          <div className="flex-1" />
          <button type="button" className={iconBtn} onClick={startCast} disabled={castBusy} aria-label="Transmitir para a TV" title="Transmitir para a TV (Chromecast, AirPlay)">
            {castBusy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Cast className="h-5 w-5" aria-hidden />}
          </button>
          <button type="button" className={iconBtn} onClick={() => setFit(fitMode === 'cover' ? 'contain' : 'cover')} aria-label={fitMode === 'cover' ? 'Ajustar à tela' : 'Preencher a tela'} aria-pressed={fitMode === 'cover'} title={fitMode === 'cover' ? 'Ajustar à tela' : 'Preencher a tela'}>
            <Crop className="h-5 w-5" aria-hidden />
          </button>
          {levels.length > 1 && (
            <div className="relative">
              <button type="button" className={`${iconBtn} !w-auto gap-1 px-2 text-xs font-semibold`} onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Qualidade">
                <Settings className="h-5 w-5" aria-hidden /> <span className="hidden sm:inline">{level === -1 ? 'Auto' : levelLabel(levels[level])}</span>
              </button>
              {menu && (
                <ul className="absolute bottom-full right-0 mb-2 min-w-[110px] overflow-hidden rounded-lg bg-black/95 text-sm text-white shadow-xl ring-1 ring-white/15" role="menu">
                  <li><button type="button" role="menuitem" className={`block w-full px-4 py-2 text-left hover:bg-white/15 ${level === -1 ? 'font-bold' : ''}`} onClick={() => changeLevel(-1)}>Auto</button></li>
                  {levels.map((l) => (
                    <li key={l.index}><button type="button" role="menuitem" className={`block w-full px-4 py-2 text-left hover:bg-white/15 ${level === l.index ? 'font-bold' : ''}`} onClick={() => changeLevel(l.index)}>{levelLabel(l)}</button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {onToggleFs && (
            <button type="button" className={iconBtn} onClick={onToggleFs} aria-label={fs ? 'Sair da tela cheia' : 'Tela cheia'}>
              {fs ? <Minimize className="h-6 w-6" aria-hidden /> : <Maximize className="h-6 w-6" aria-hidden />}
            </button>
          )}
        </div>
      </div>

      {castNote && (
        <p className="pointer-events-none absolute left-1/2 top-3 z-30 max-w-[90%] -translate-x-1/2 rounded-lg bg-black/85 px-3 py-2 text-center text-xs text-white shadow-lg" role="status">{castNote}</p>
      )}

      {casting && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/95 p-4 text-center text-white" role="status">
          <Cast className="h-12 w-12 text-primary" aria-hidden />
          <p className="text-base font-semibold sm:text-lg">Transmitindo para {castState.device}</p>
          {title && <p className="max-w-md truncate text-sm text-white/60">{title}</p>}
          <div className="flex items-center gap-3">
            <button type="button" className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25" onClick={() => castRef.current?.togglePause()} aria-label={castState.paused ? 'Reproduzir na TV' : 'Pausar na TV'}>
              {castState.paused ? <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden /> : <Pause className="h-6 w-6 fill-current" aria-hidden />}
            </button>
            <button type="button" className="rounded-full bg-white/15 px-5 py-3 text-sm font-semibold transition hover:bg-white/25" onClick={() => castRef.current?.stop()}>Parar transmissão</button>
          </div>
        </div>
      )}
    </div>
  );
}
