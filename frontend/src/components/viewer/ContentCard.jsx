import { useState } from 'react';
import { Play, Radio, Star } from 'lucide-react';
import { useContentModal } from './contentModalContext.js';

/** Cartão de conteúdo (canal 16:9, filme/série em pôster 2:3). Ao clicar abre o modal de detalhes/reprodução. */
export default function ContentCard({ content, className = '' }) {
  const modal = useContentModal();
  const [broken, setBroken] = useState(false);
  const live = content.type === 'live';
  const showImage = content.icon && !broken;
  const progress = content.durationSeconds > 0 && content.positionSeconds != null ? Math.min(100, (content.positionSeconds / content.durationSeconds) * 100) : null;
  const meta = [content.year, content.rating > 0 ? content.rating.toFixed(1) : null].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => modal.open(content)}
      className={`group relative z-0 block shrink-0 text-left transition-transform duration-300 ease-out hover:z-20 hover:scale-[1.12] focus-visible:z-20 focus-visible:scale-[1.12] ${live ? 'w-40 sm:w-48' : 'w-32 sm:w-40'} ${className}`}
      title={content.name}
      aria-label={`Abrir ${content.name}`}
    >
      <div className={`relative overflow-hidden rounded-md bg-fg/5 transition duration-300 ease-out group-hover:shadow-2xl group-hover:ring-2 group-hover:ring-white/80 ${live ? 'aspect-video' : 'aspect-[2/3]'}`}>
        {showImage ? (
          <img
            src={content.icon}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className={`h-full w-full ${live ? 'object-contain p-3' : 'object-cover'}`}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-fg/50">
            {live ? <Radio className="h-6 w-6" aria-hidden /> : <Play className="h-6 w-6" aria-hidden />}
            <span className="line-clamp-3 text-xs">{content.name}</span>
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition duration-300 group-hover:bg-black/40 group-hover:opacity-100" aria-hidden>
          <span className="flex h-10 w-10 scale-75 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform duration-300 group-hover:scale-100">
            <Play className="h-5 w-5 translate-x-0.5 fill-black text-black" />
          </span>
        </span>
        {live && <span className="absolute left-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Ao vivo</span>}
        {content.type === 'series' && <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Série</span>}
        {!live && (
          <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2 pb-1.5 pt-6 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <p className="truncate text-xs font-semibold text-white">{content.name}</p>
            {meta.length > 0 && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/70">
                {content.rating > 0 && <span className="inline-flex items-center gap-0.5 text-amber-400"><Star className="h-2.5 w-2.5 fill-current" aria-hidden />{content.rating.toFixed(1)}</span>}
                {content.year && <span>{content.year}</span>}
              </p>
            )}
          </div>
        )}
        {progress != null && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50" aria-hidden>
            <span className="block h-full bg-primary" style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate text-xs font-medium text-fg/90 transition group-hover:opacity-0">{content.name}</p>
      {!live && content.year && <p className="text-[11px] text-fg/50 transition group-hover:opacity-0">{content.year}</p>}
    </button>
  );
}
