import { Volume2, VolumeX } from 'lucide-react';
import { playPreview, setSoundEnabled, useSoundEnabled } from '../../utils/sound.js';
import { useViewer } from '../../contexts/ViewerContext.jsx';

/** Liga/desliga os sons da interface (preferência salva neste navegador). Só aparece se o painel do cliente ativou os sons. */
export default function SoundToggle({ className = '' }) {
  const { tenant } = useViewer();
  const on = useSoundEnabled();
  if (!tenant.uiSoundsEnabled) return null;
  const toggle = () => {
    setSoundEnabled(!on);
    if (!on) playPreview();
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Desativar sons' : 'Ativar sons'}
      title={on ? 'Sons ativados' : 'Sons desativados'}
      className={`inline-flex items-center gap-2 rounded-full border border-fg/25 px-3 py-1.5 text-sm text-fg/70 transition hover:border-fg/60 hover:text-fg ${className}`}
    >
      {on ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
      <span>Som {on ? 'ligado' : 'desligado'}</span>
    </button>
  );
}
