import { Play } from 'lucide-react';
import { useViewer } from '../../contexts/ViewerContext.jsx';

/** Logotipo da marca do assinante (white-label). Usa logo do menu, logo principal ou o nome. */
export default function BrandLogo({ className = '', imgClassName = 'h-8 max-w-[160px]', showName = false }) {
  const { tenant } = useViewer();
  const brand = tenant?.brand;
  if (!brand) return null;
  const src = brand.assets.menuLogo || brand.assets.logo;
  return (
    <span className={`inline-flex items-center gap-2 font-bold ${className}`}>
      {src ? (
        <img src={src} alt={showName ? '' : brand.displayName} className={`${imgClassName} object-contain`} />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-button" aria-hidden><Play className="h-4 w-4" /></span>
      )}
      {(!src || showName) && <span className="truncate">{brand.displayName}</span>}
    </span>
  );
}
