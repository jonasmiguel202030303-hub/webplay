/**
 * Tela cheia robusta entre navegadores: usa a Fullscreen API padrão (com prefixos legados) no
 * contêiner e, quando ela não existe (Safari no iPhone, que só suporta fullscreen no <video>),
 * cai para o modo nativo do próprio elemento de vídeo.
 */
export function enterFullscreen(container, video) {
  const req = container?.requestFullscreen || container?.webkitRequestFullscreen || container?.mozRequestFullScreen || container?.msRequestFullscreen;
  if (req) {
    try {
      const r = req.call(container);
      if (r?.catch) r.catch(() => video?.webkitEnterFullscreen?.());
      return;
    } catch {
      /* cai para o fallback abaixo */
    }
  }
  video?.webkitEnterFullscreen?.();
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
