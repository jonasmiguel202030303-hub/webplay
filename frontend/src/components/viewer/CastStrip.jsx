import { useState } from 'react';
import { Play } from 'lucide-react';

function CastMember({ m }) {
  const [broken, setBroken] = useState(false);
  const initials = m.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (
    <li className="w-[72px] shrink-0 text-center sm:w-20">
      {m.photo && !broken ? (
        <img src={m.photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="mx-auto h-16 w-16 rounded-full bg-fg/10 object-cover sm:h-[72px] sm:w-[72px]" />
      ) : (
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-fg/10 text-lg font-semibold text-fg/60 sm:h-[72px] sm:w-[72px]" aria-hidden>{initials}</span>
      )}
      <span className="mt-1.5 line-clamp-2 block text-xs font-medium leading-tight text-fg/85">{m.name}</span>
      {m.character && <span className="line-clamp-1 block text-[11px] leading-tight text-fg/50">{m.character}</span>}
    </li>
  );
}

/** Faixa de elenco com foto (TMDB); sem foto, cai para as iniciais. `listClassName` ajusta a sangria lateral do container. */
export default function CastStrip({ d, listClassName = '' }) {
  const members = d?.castList?.length
    ? d.castList
    : String(d?.cast ?? '').split(/[,;]/).map((n) => n.trim()).filter(Boolean).slice(0, 14).map((name) => ({ name, photo: null, character: null }));
  if (!members.length) return null;
  return (
    <section aria-label="Elenco">
      <h3 className="mb-2 text-sm font-semibold text-fg/80">Elenco</h3>
      <ul className={`flex gap-3 overflow-x-auto pb-2 ${listClassName}`}>
        {members.map((m, i) => <CastMember key={`${m.name}-${i}`} m={m} />)}
      </ul>
    </section>
  );
}

export function EpisodeThumb({ src }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="flex h-[54px] w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-fg/10 sm:h-14 sm:w-28">
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover transition group-hover:brightness-110" />
      ) : (
        <Play className="h-5 w-5 text-fg/30" aria-hidden />
      )}
    </span>
  );
}
