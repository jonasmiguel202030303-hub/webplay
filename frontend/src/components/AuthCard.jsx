import Logo from './Logo.jsx';

/** Cartão centralizado para telas de acesso (entrar, cadastro, recuperação). */
export default function AuthCard({ title, subtitle, children, footer, wide = false }) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full items-center justify-center px-4 py-10">
      <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'}`}>
        <div className="mb-6 text-center"><Logo className="text-xl" /></div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-fg/60">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-fg/60">{footer}</div>}
      </div>
    </div>
  );
}
