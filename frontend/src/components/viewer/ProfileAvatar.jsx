import { useState } from 'react';

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

/** Galerias de avatares (imagens em /avatars). A chave salva no perfil é o nome do arquivo sem extensão. */
export const AVATAR_GROUPS = [
  { id: 'people', label: 'Pessoas', keys: range(25).map((n) => `people-${n}`) },
  { id: 'pets', label: 'Pets', keys: range(9).map((n) => `pet-${n}`) },
  { id: 'robots', label: 'Robôs', keys: range(8).map((n) => `robot-${n}`) },
  { id: 'smiley', label: 'Carinhas', keys: [...range(5).map((n) => `avatar-0${n}`), ...range(16).map((n) => `smiley-${n}`)] },
];

const FOLDERS = { people: 'people', pet: 'pets', robot: 'robots', smiley: 'smiley', avatar: 'smiley' };

/** Cores antigas (perfis criados antes das imagens): continuam funcionando como inicial colorida. */
const COLORS = {
  violet: 'bg-violet-600', blue: 'bg-blue-600', pink: 'bg-pink-600', amber: 'bg-amber-500',
  emerald: 'bg-emerald-600', rose: 'bg-rose-600', cyan: 'bg-cyan-600', slate: 'bg-slate-600',
};

export const DEFAULT_AVATAR = 'people-1';

export const avatarSrc = (key) => {
  const m = /^(people|pet|robot|smiley|avatar)-\d{1,2}$/.exec(key ?? '');
  return m ? `/avatars/${FOLDERS[m[1]]}/${key}.jpg` : null;
};

/** Avatar de perfil: imagem do catálogo de avatares; se faltar/falhar, inicial do nome sobre uma cor. */
export default function ProfileAvatar({ name = '?', avatar = DEFAULT_AVATAR, size = 'md', className = '' }) {
  const sizes = { sm: 'h-8 w-8 text-sm', md: 'h-12 w-12 text-lg', lg: 'h-24 w-24 text-4xl sm:h-32 sm:w-32' };
  const [broken, setBroken] = useState(false);
  const src = avatarSrc(avatar);
  const base = `inline-block shrink-0 select-none overflow-hidden rounded-md ${sizes[size]} ${className}`;
  if (src && !broken) {
    return <img src={src} alt="" className={`${base} object-cover`} onError={() => setBroken(true)} draggable={false} />;
  }
  return (
    <span className={`${base} inline-flex items-center justify-center font-bold text-white ${COLORS[avatar] ?? COLORS.violet}`} aria-hidden>
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}
