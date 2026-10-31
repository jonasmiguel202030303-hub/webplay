import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import Player from './Player.jsx';
import Button from '../ui/Button.jsx';
import { enterFullscreen, exitFullscreen, fullscreenElement, lockLandscape, unlockOrientation } from '../../utils/fullscreen.js';

const PLAYER_ERRORS = {
  'mixed-content': {
    title: 'Conteúdo bloqueado pelo navegador',
    text: 'A fonte deste conteúdo usa uma conexão não segura (http) e o navegador bloqueia a reprodução dentro de uma página segura (https). O responsável pela plataforma precisa usar uma fonte com https.',
  },
  unsupported: {
    title: 'Navegador sem suporte',
    text: 'Este navegador não consegue reproduzir este tipo de transmissão. Tente outro navegador (Chrome, Edge, Firefox ou Safari atualizados).',
  },
  network: {
    title: 'Não foi possível carregar o vídeo',
    text: 'A fonte não respondeu ou bloqueou o acesso. Pode ser uma instabilidade temporária; tente novamente em instantes.',
  },
  format: {
    title: 'Formato não suportado',
    text: 'O navegador não consegue reproduzir o formato deste conteúdo (por exemplo MKV). Tente outro conteúdo ou outro navegador.',
  },
  unknown: { title: 'Erro ao reproduzir', text: 'Ocorreu um erro inesperado na reprodução. Tente novamente.' },
};

/** Monta a cadeia de fontes: direto (+ formatos alternativos) e, por último, o relay da plataforma. */
export function buildSources(play) {
  if (!play) return [];
  const main = [{ url: play.url, format: play.format }, ...(play.alternatives || []).map((a) => ({ url: a.url, format: a.format }))];
  if (play.relayOnly || !play.relayUrl) return main;
  const relay = [{ url: play.relayUrl, format: play.format }, ...(play.alternatives || []).filter((a) => a.relayUrl).map((a) => ({ url: a.relayUrl, format: a.format }))];
  return [...main, ...relay];
}

/**
 * Player + tela de erro com "Tentar novamente". `play` é a resposta de /play/... do backend.
 * Todo o fallback (HLS → TS → relay) acontece dentro do Player; o erro só aparece quando todas as fontes falham.
 * Expõe `requestFullscreen()` via ref para quem precisar de um botão de tela cheia fora do player (ex: modal).
 */
const PlayerFrame = forwardRef(function PlayerFrame({ play, live = false, startAt = 0, title, autoPlay = true, onProgress, onReady, onTimeUpdate, onEnded, children, className = '' }, ref) {
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const sources = useMemo(() => buildSources(play), [play]);
  const info = error ? PLAYER_ERRORS[error.kind] ?? PLAYER_ERRORS.unknown : null;
  const boxRef = useRef(null);
  const videoRef = useRef(null);
  const [fs, setFs] = useState(false);
  // Modo de reserva: quando o navegador nega a Fullscreen API, o player ocupa a janela inteira.
  const [fake, setFake] = useState(false);
  const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  useEffect(() => {
    const onChange = () => {
      const on = fullscreenElement() === boxRef.current;
      setFs(on);
      if (!on) unlockOrientation();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);
  useEffect(() => {
    if (!fake) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [fake]);
  const toggleFs = async () => {
    if (fake) { setFake(false); return; }
    if (fullscreenElement() === boxRef.current) { exitFullscreen(); return; }
    const result = await enterFullscreen(boxRef.current, videoRef.current);
    if (result === 'element') { if (coarse) lockLandscape(); } else if (result === 'none') setFake(true);
  };
  useImperativeHandle(ref, () => ({ requestFullscreen: toggleFs }));
  const handleReady = (video) => {
    videoRef.current = video;
    onReady?.(video);
  };
  const full = fs || fake;

  return (
    <div ref={boxRef} className={`relative aspect-video w-full overflow-hidden bg-black ${fake ? '!fixed inset-0 z-[9999] !aspect-auto !h-full !max-h-none' : ''} ${fs ? '!aspect-auto !h-full !max-h-none' : ''} ${className}`}>
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-auto p-6 text-center text-white" role="alert">
          <TriangleAlert className="h-8 w-8 text-amber-400" aria-hidden />
          <p className="font-semibold">{info.title}</p>
          <p className="max-w-lg text-sm text-white/70">{info.text}</p>
          {error.detail && <p className="max-w-lg break-words font-mono text-[11px] text-white/40">Detalhe técnico: {error.detail}</p>}
          {error.kind !== 'mixed-content' && (
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => { setError(null); setAttempt((a) => a + 1); }}>
              Tentar novamente
            </Button>
          )}
        </div>
      ) : (
        <Player key={`${attempt}-${sources[0]?.url}`} sources={sources} live={live} startAt={startAt} title={title} autoPlay={autoPlay} fs={full} onToggleFs={toggleFs} onError={setError} onProgress={onProgress} onReady={handleReady} onTimeUpdate={onTimeUpdate} onEnded={onEnded} />
      )}
      {!error && children}
    </div>
  );
});

export default PlayerFrame;
