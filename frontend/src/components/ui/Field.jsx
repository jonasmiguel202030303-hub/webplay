import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Campo com rótulo, dica e erro ligados por aria-describedby. `as` pode ser "textarea" ou "select". */
export function Field({ label, hint, error, as = 'input', className = '', children, id, ...rest }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined;
  const Tag = as;
  const props = { id: fieldId, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, className: `input ${error ? 'border-red-500' : ''} ${className}`, ...rest };
  return (
    <div>
      {label && (
        <label htmlFor={fieldId} className="label">
          {label}
          {rest.required && <span className="text-red-400"> *</span>}
        </label>
      )}
      {Tag === 'select' ? <select {...props}>{children}</select> : <Tag {...props} />}
      {error ? (
        <p id={`${fieldId}-err`} className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordField({ label = 'Senha', error, hint, ...rest }) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {rest.required && <span className="text-red-400"> *</span>}
      </label>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} className={`input pr-10 ${error ? 'border-red-500' : ''}`} aria-invalid={error ? true : undefined} {...rest} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-fg/50 hover:text-fg"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? <p className="field-error" role="alert">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, error, className = '', ...rest }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm text-fg/80">
        <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-fg/30 accent-[rgb(var(--c-primary))]" {...rest} />
        <span>{label}</span>
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>
        {description && <p className="hint">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-fg/25'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
