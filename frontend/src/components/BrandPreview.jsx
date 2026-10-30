import { Heart, Play, Search } from 'lucide-react';
import { themeVars } from '../utils/theme.js';

/** Miniatura ao vivo da página do espectador com as cores/imagens em edição. */
export default function BrandPreview({ form, brand }) {
  const vars = themeVars({ primary: form.colorPrimary, secondary: form.colorSecondary, button: form.colorButton, background: form.colorBackground });
  const assets = brand?.assets ?? {};
  return (
    <div style={vars} className="overflow-hidden rounded-xl border border-fg/15 bg-bg text-fg shadow-lg" aria-label="Pré-visualização da sua página">
      <div className="flex items-center gap-2 border-b border-fg/10 px-3 py-2">
        {assets.menuLogo || assets.logo ? <img src={assets.menuLogo || assets.logo} alt="" className="h-6 max-w-[96px] object-contain" /> : <span className="flex h-6 w-6 items-center justify-center rounded bg-primary text-on-button"><Play className="h-3 w-3" /></span>}
        <span className="text-xs font-bold">{form.displayName || 'Sua marca'}</span>
        <span className="ml-auto flex gap-2 text-fg/60"><Search className="h-3.5 w-3.5" /><Heart className="h-3.5 w-3.5" /></span>
      </div>
      {form.notice && <div className="bg-primary/20 px-3 py-1 text-[10px]">{form.notice}</div>}
      <div className="relative h-32 overflow-hidden" style={assets.banner ? { backgroundImage: `url(${assets.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        {!assets.banner && <div className="absolute inset-0 bg-gradient-to-br from-primary/60 to-secondary/60" />}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3">
          <p className="truncate text-sm font-bold">{form.bannerTitle || `Bem-vindo ao ${form.displayName || 'seu player'}`}</p>
          <p className="truncate text-[10px] text-fg/70">{form.bannerSubtitle || 'Seu subtítulo aparece aqui'}</p>
          <span className="mt-1.5 inline-flex items-center gap-1 rounded bg-button px-2 py-0.5 text-[10px] font-semibold text-on-button"><Play className="h-2.5 w-2.5" /> Assistir</span>
        </div>
      </div>
      <div className="space-y-2 p-3">
        <p className="text-[10px] font-semibold text-fg/80">Em destaque</p>
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[2/3] w-1/4 rounded bg-fg/10" />)}
        </div>
      </div>
    </div>
  );
}
