import { useId } from 'react';

/** Seletor de cor com campo hexadecimal. Valida o formato #RRGGBB antes de enviar ao servidor. */
export default function ColorField({ label, value, onChange, error }) {
  const id = useId();
  const valid = /^#[0-9a-fA-F]{6}$/.test(value ?? '');
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (seletor)`}
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-fg/15 bg-transparent p-1"
        />
        <input id={id} className={`input font-mono uppercase ${!valid || error ? 'border-red-500' : ''}`} value={value ?? ''} maxLength={7} onChange={(e) => onChange(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)} />
      </div>
      {(error || !valid) && <p className="field-error" role="alert">{error || 'Use o formato #RRGGBB.'}</p>}
    </div>
  );
}
