import { PauseCircle } from 'lucide-react';
import BrandLogo from '../../components/viewer/BrandLogo.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useTitle } from '../../hooks/useTitle.js';

/** Exibida quando o assinante está sem assinatura ativa: o espectador não vê detalhes de cobrança. */
export default function Unavailable() {
  const { tenant } = useViewer();
  useTitle(`Indisponível — ${tenant.brand.displayName}`);
  const { brand } = tenant;
  const wa = brand.whatsapp ? `https://wa.me/${brand.whatsapp.replace(/\D/g, '')}` : null;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <BrandLogo className="mb-8 text-xl" imgClassName="h-14 max-w-[240px]" />
      <PauseCircle className="h-12 w-12 text-fg/40" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">Página temporariamente indisponível</h1>
      <p className="mt-2 max-w-md text-sm text-fg/60">
        O acesso a esta plataforma está indisponível no momento. Tente novamente mais tarde ou fale com o responsável.
      </p>
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-6">Falar com o suporte</a>}
    </div>
  );
}
