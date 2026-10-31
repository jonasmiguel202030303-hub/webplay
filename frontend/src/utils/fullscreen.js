/**
 * Tela cheia robusta entre navegadores: usa a Fullscreen API padrão (com prefixos legados) no
 * contêiner e, quando ela não existe (Safari no iPhone, que só suporta fullscreen no <video>),
 * cai para o modo nativo do próprio elemento de vídeo.
 */
/** Devolve 'element' (tela cheia do contêiner), 'video' (nativo do <video>, iPhone) ou 'none' (sem suporte/bloqueado). */
export async function enterFullscreen(container, video) {
  const req = container?.requestFullscreen || container?.webkitRequestFullscreen || container?.mozRequestFullScreen || container?.msRequestFullscreen;
  if (req) {
    try {
      await req.call(container);
      return 'element';
    } catch {
      /* cai para o fallback abaixo */
    }
  }
  if (video?.webkitEnterFullscreen) {
    try {
      video.webkitEnterFullscreen();
      return 'video';
    } catch {
      /* sem suporte */
    }
  }
  return 'none';
}

/** No celular, deita a tela ao entrar em tela cheia (só funciona dentro da tela cheia; falhas são ignoradas). */
export function lockLandscape() {
  try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* ignora */ }
}

export function unlockOrientation() {
  try { screen.orientation?.unlock?.(); } catch { /* ignora */ }
}

export function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
  try { exit?.call(document); } catch { /* ignora */ }
}

export function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || null;
}

/** true se o navegador atual não tem Fullscreen API para elementos genéricos (iPhone Safari). */
export function isIosVideoOnlyFullscreen() {
  const el = document.documentElement;
  return !(el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen);
}
