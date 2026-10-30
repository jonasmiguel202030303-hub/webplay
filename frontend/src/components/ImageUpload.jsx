import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import Button from './ui/Button.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Envio de imagem de marca. O servidor revalida tipo/tamanho e re-codifica a imagem. */
export default function ImageUpload({ label, hint, value, onUpload, onRemove, aspect = 'aspect-video', contain = false }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error('Formato não permitido. Use PNG, JPG ou WebP.');
    if (file.size > MAX_BYTES) return toast.error('A imagem excede 2 MB. Reduza o tamanho e tente novamente.');
    setBusy(true);
    try {
      await onUpload(file);
      toast.success(`${label} atualizado.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await onRemove();
      toast.success(`${label} removido.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-fg/10 p-3">
      <p className="label">{label}</p>
      <div className={`flex ${aspect} max-h-40 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-fg/15 bg-fg/5`}>
        {value ? <img src={value} alt={`Pré-visualização: ${label}`} className={`h-full w-full ${contain ? 'object-contain' : 'object-cover'}`} /> : <span className="text-xs text-fg/40">Nenhuma imagem</span>}
      </div>
      {hint && <p className="hint">{hint}</p>}
      <div className="mt-2 flex gap-2">
        <input ref={inputRef} type="file" accept={TYPES.join(',')} className="sr-only" onChange={pick} aria-label={`Enviar ${label}`} />
        <Button variant="secondary" size="sm" icon={ImagePlus} loading={busy} onClick={() => inputRef.current?.click()}>{value ? 'Trocar' : 'Enviar'}</Button>
        {value && <Button variant="ghost" size="sm" icon={Trash2} disabled={busy} onClick={remove}>Remover</Button>}
      </div>
    </div>
  );
}
