import { useEffect, useState } from 'react';
import { ExternalLink, Info, MessageCircle, Play } from 'lucide-react';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useContentModal } from './contentModalContext.js';
import { TYPE_LABEL } from './content.js';

const waLink = (n) => `https://wa.me/${String(n).replace(/\D/g, '')}`;

/**
 * Destaque da página inicial: gira entre os títulos em destaque (a cada 8 s, pausa ao passar o mouse),
 * com os textos, imagem e links configurados pelo assinante.
 */
export default function Banner({ featured = [] }) {
  const { tenant } = useViewer();
  const modal = useContentModal();
  const { brand } = tenant;
  const image = brand.assets.banner;
  const links = brand.externalLinks ?? [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const list = featured.slice(0, 6);
  const current = list.length ? list[index % list.length] : null;

  useEffect(() => {
    if (list.length < 2 || paused) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % list.length), 8000);
    return () => clearInterval(t);
  }, [list.length, paused]);

  const bg = image || current?.icon;
  return (
    <section
      className="relative isolate overflow-hidden border-b border-fg/10"
      aria-label="Destaque"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {bg && (
        <img
          key={bg}
          src={bg}
          alt=""
          referrerPolicy="no-referrer"
          className={`absolute inset-0 -z-10 h-full w-full animate-fade-in object-cover ${image ? '' : 'scale-110 blur-2xl'}`}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className={`absolute inset-0 -z-10 ${bg ? 'bg-gradient-to-r from-bg via-bg/75 to-bg/10' : 'bg-gradient-to-br from-primary/40 via-secondary/20 to-bg'}`} aria-hidden />
      <div className="absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-black/60 to-transparent" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-bg to-transparent" aria-hidden />
      <div className="mx-auto flex min-h-[320px] max-w-7xl items-end gap-8 px-4 py-8 sm:min-h-[460px] sm:px-6 lg:min-h-[560px]">
        <div className="min-w-0 flex-1 space-y-3">
          {current ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-fg/70">{brand.bannerTitle || brand.displayName} · {TYPE_LABEL[current.type]}</p>
              <h1 className="line-clamp-3 max-w-2xl text-3xl font-extrabold leading-tight drop-shadow sm:text-5xl lg:text-6xl">{current.name}</h1>
            </>
          ) : (
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-5xl">{brand.bannerTitle || brand.displayName}</h1>
          )}
          {brand.bannerSubtitle && <p className="max-w-xl text-sm text-fg/80 sm:text-base">{brand.bannerSubtitle}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {current && (
              <>
                <button type="button" className="btn btn-primary" onClick={() => modal.open(current)}><Play className="h-4 w-4 fill-current" aria-hidden /> Assistir</button>
                <button type="button" className="btn btn-secondary" onClick={() => modal.open(current)}><Info className="h-4 w-4" aria-hidden /> Mais informações</button>
              </>
            )}
            {brand.whatsapp && (
              <a href={waLink(brand.whatsapp)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary"><MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp</a>
            )}
            {links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary"><ExternalLink className="h-4 w-4" aria-hidden /> {l.label}</a>
            ))}
          </div>
          {list.length > 1 && (
            <div className="flex gap-1.5 pt-2" role="tablist" aria-label="Destaques">
              {list.map((c, i) => (
                <button
                  key={`${c.type}-${c.streamId}`}
                  type="button"
                  role="tab"
                  aria-selected={i === index % list.length}
                  aria-label={`Destaque ${i + 1}: ${c.name}`}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${i === index % list.length ? 'w-8 bg-fg' : 'w-4 bg-fg/40 hover:bg-fg/70'}`}
                />
              ))}
            </div>
          )}
        </div>
        {current?.icon && (
          <button type="button" onClick={() => modal.open(current)} className="hidden shrink-0 md:block" aria-label={`Abrir ${current.name}`}>
            <img key={current.icon} src={current.icon} alt="" referrerPolicy="no-referrer" className="h-64 w-44 animate-fade-in rounded-lg object-cover shadow-2xl ring-1 ring-fg/20 transition hover:scale-105 lg:h-80 lg:w-56" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          </button>
        )}
      </div>
    </section>
  );
}
