import { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';

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

export default function Player({ sources, live = false, startAt = 0, title, autoPlay = true, nativeFullscreen = true, onError, onProgress, onReady, onTimeUpdate, onEnded }) {
  const videoRef = useRef(null);
  const cbRef = useRef({});
  cbRef.current = { onError, onProgress, onReady, onTimeUpdate, onEnded };
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1);
  const [menu, setMenu] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const hlsRef = useRef(null);
  const sourcesKey = (sources || []).map((s) => s.url).join('|');

  useEffect(() => {
    const video = videoRef.current;
    const list = (sources || []).filter((s) => s?.url);
    if (!video || list.length === 0) return undefined;
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
      if (!live && startAt > 10 && Number.isFinite(video.duration) && startAt < video.duration - 15) video.currentTime = startAt;
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
            window.__ev = []; for (const n of Object.values(Hls.Events)) hls.on(n, (_e, d) => { if (!/Progress|Pts|Decrypted|Created|Attach|Updated/i.test(n)) window.__ev.push(Math.round(performance.now() / 100) / 10 + 's ' + n + ' ' + (d?.details ?? '') + (d?.frag ? ' sn' + d.frag.sn : '') + (d?.error?.message ? ' ' + d.error.message : '') + (d?.fatal !== undefined ? ' fatal=' + d.fatal : '')); }); // DBG
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
  }, [sourcesKey, live, startAt, autoPlay]);

  const changeLevel = (i) => {
    setLevel(i);
    setMenu(false);
    if (hlsRef.current) hlsRef.current.currentLevel = i;
  };
  const levelLabel = (l) => (l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`);

  return (
    <div className="relative h-full w-full bg-black">
      <video ref={videoRef} className="h-full w-full bg-black" controls controlsList={nativeFullscreen ? undefined : 'nofullscreen'} playsInline aria-label={title} />
      {reconnecting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white" role="status">
          Reconectando ao canal…
        </div>
      )}
      {levels.length > 1 && (
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            className="flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs text-white backdrop-blur hover:bg-black/80"
            onClick={() => setMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
          >
            <Settings className="h-3.5 w-3.5" aria-hidden /> {level === -1 ? 'Auto' : levelLabel(levels[level])}
          </button>
          {menu && (
            <ul className="mt-1 min-w-[96px] overflow-hidden rounded bg-black/90 text-xs text-white shadow-lg" role="menu">
              <li><button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-white/15" onClick={() => changeLevel(-1)}>Auto</button></li>
              {levels.map((l) => (
                <li key={l.index}><button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-white/15" onClick={() => changeLevel(l.index)}>{levelLabel(l)}</button></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
