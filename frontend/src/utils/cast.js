/** Transmissão para TVs da mesma rede Wi-Fi (Chromecast / Google TV / TVs com Chromecast embutido) via Google Cast. */

const SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
let sdkPromise = null;

const castError = (code) => Object.assign(new Error(code), { code });

/** Carrega o SDK só quando o usuário pede (não há script de terceiros antes disso). */
function loadSdk() {
  sdkPromise ??= new Promise((resolve) => {
    window.__onGCastApiAvailable = (available) => {
      if (!available) { resolve(false); return; }
      window.cast.framework.CastContext.getInstance().setOptions({
        receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      resolve(true);
    };
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return sdkPromise;
}

const MIME = { m3u8: 'application/x-mpegURL', mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', ts: 'video/mp2t', mp3: 'audio/mpeg' };

/** A TV busca a mídia sozinha: só serve URL pública (relay da plataforma ou https da fonte), nunca localhost. */
export function pickCastSource(sources) {
  const list = (sources ?? []).filter((s) => s?.url && (s.url.startsWith('/') || s.url.startsWith('https:')));
  const rank = (s) => (s.url.startsWith('/') ? 0 : 10) + (s.format === 'm3u8' ? 0 : s.format === 'ts' ? 2 : 1);
  const best = [...list].sort((a, b) => rank(a) - rank(b))[0];
  return best ? { ...best, url: new URL(best.url, window.location.origin).href } : null;
}

/** Abre o seletor de TVs e começa a transmitir. Rejeita com Error.code: unsupported | local | cancel | receiver_unavailable | load_failed. */
export async function castStart({ url, format, live, title, startAt = 0 }) {
  if (/^(localhost|127\.|\[::1\])/.test(window.location.hostname)) throw castError('local');
  if (!(await loadSdk())) throw castError('unsupported');
  const { cast } = window;
  const { chrome } = window;
  const ctx = cast.framework.CastContext.getInstance();
  try {
    await ctx.requestSession();
  } catch (err) {
    throw castError(typeof err === 'string' ? err : 'cancel');
  }
  const session = ctx.getCurrentSession();
  if (!session) throw castError('cancel');

  const ext = format || (/\.m3u8(\?|$)/i.test(url) ? 'm3u8' : 'mp4');
  const media = new chrome.cast.media.MediaInfo(url, MIME[ext] ?? 'video/mp4');
  media.streamType = live ? chrome.cast.media.StreamType.LIVE : chrome.cast.media.StreamType.BUFFERED;
  media.metadata = new chrome.cast.media.GenericMediaMetadata();
  media.metadata.title = title || '';
  const request = new chrome.cast.media.LoadRequest(media);
  request.autoplay = true;
  if (!live && startAt > 5) request.currentTime = startAt;
  const failure = await session.loadMedia(request);
  if (failure) {
    ctx.endCurrentSession(true);
    throw castError('load_failed');
  }

  const player = new cast.framework.RemotePlayer();
  const controller = new cast.framework.RemotePlayerController(player);
  let last = startAt;
  const listeners = new Set();
  const emit = () => {
    if (Number.isFinite(player.currentTime) && player.currentTime > 0) last = player.currentTime;
    for (const cb of listeners) cb({ paused: player.isPaused, connected: player.isConnected });
  };
  controller.addEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE, emit);
  const onSession = (e) => {
    if (e.sessionState === cast.framework.SessionState.SESSION_ENDED) {
      ctx.removeEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, onSession);
      for (const cb of listeners) cb({ paused: false, connected: false });
    }
  };
  ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, onSession);

  return {
    device: session.getCastDevice()?.friendlyName ?? 'TV',
    lastTime: () => last,
    togglePause: () => controller.playOrPause(),
    stop: () => ctx.endCurrentSession(true),
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
  };
}

export function castMessage(code) {
  switch (code) {
    case 'local': return 'A transmissão só funciona no site publicado (https), não em localhost.';
    case 'unsupported': return 'Este navegador não oferece transmissão. Use Chrome ou Edge (Chromecast e TVs com Chromecast) ou Safari (AirPlay).';
    case 'receiver_unavailable': return 'Nenhuma TV encontrada. Confirme que a TV e este aparelho estão na mesma rede Wi-Fi.';
    case 'no-source': return 'Este conteúdo não tem uma fonte segura para transmitir.';
    default: return 'Não foi possível transmitir para a TV. Confirme que ela está ligada e na mesma rede Wi-Fi.';
  }
}
