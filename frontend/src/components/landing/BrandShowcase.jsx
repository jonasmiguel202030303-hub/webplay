import { useState } from 'react';
import { Heart, History, Home, LayoutGrid, Search } from 'lucide-react';

// Temas de exemplo: apenas ilustram a troca de identidade visual (cores em RGB "r g b").
const THEMES = [
  { id: 'violeta', label: 'Violeta', primary: '124 58 237', secondary: '37 99 235' },
  { id: 'azul', label: 'Azul', primary: '37 99 235', secondary: '14 165 233' },
  { id: 'esmeralda', label: 'Esmeralda', primary: '5 150 105', secondary: '20 184 166' },
  { id: 'rosa', label: 'Rosa', primary: '219 39 119', secondary: '244 63 94' },
];

const NAV = ['Início', 'Categorias', 'Favoritos', 'Histórico'];

function Tiles({ count, accent }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="aspect-[4/5] rounded-md border border-white/5 bg-white/[0.06] p-1.5">
          <div className="h-full rounded bg-gradient-to-br from-white/10 to-transparent" />
          <div className="mt-1 h-1 w-2/3 rounded-full" style={{ background: `rgb(${accent} / 0.6)` }} />
        </div>
      ))}
    </div>
  );
}

export default function BrandShowcase() {
  const [themeId, setThemeId] = useState('violeta');
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const vars = { '--a': theme.primary, '--b': theme.secondary };
  const accent = 'var(--a)';

  return (
    <div className="relative" style={vars}>
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] blur-3xl transition-colors duration-500" style={{ background: 'radial-gradient(60% 60% at 50% 50%, rgb(var(--a) / 0.35), transparent)' }} aria-hidden />

      <div className="grid items-end gap-6 lg:grid-cols-[1fr_220px]">
        {/* Computador */}
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0b0b10] shadow-2xl shadow-black/60">
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="ml-3 flex-1 truncate rounded-md bg-white/5 px-3 py-1 text-[11px] text-white/50">webplaybrasil.online/sua-marca</span>
          </div>
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white transition-colors duration-500" style={{ background: `linear-gradient(135deg, rgb(${accent}), rgb(var(--b)))` }}>SM</span>
                <span className="text-sm font-bold text-white">Sua Marca</span>
              </div>
              <nav className="hidden gap-4 text-[11px] text-white/60 sm:flex" aria-hidden>
                {NAV.map((n, i) => (
                  <span key={n} className={i === 0 ? 'text-white' : ''}>{n}</span>
                ))}
              </nav>
              <Search className="h-4 w-4 text-white/50" aria-hidden />
            </div>

            <div className="relative mt-4 overflow-hidden rounded-lg p-5 transition-colors duration-500 sm:p-7" style={{ background: `linear-gradient(120deg, rgb(${accent} / 0.55), rgb(var(--b) / 0.35) 60%, rgb(11 11 16))` }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">Seu banner</p>
              <p className="mt-1 max-w-[16rem] text-lg font-extrabold leading-tight text-white sm:text-xl">Mensagem de boas-vindas da sua marca</p>
              <span className="mt-3 inline-flex rounded-md px-3 py-1.5 text-[11px] font-semibold text-white transition-colors duration-500" style={{ background: `rgb(${accent})` }}>Seu botão</span>
            </div>

            <p className="mb-2 mt-4 text-[11px] font-semibold text-white/70">Suas seções</p>
            <Tiles count={6} accent={accent} />
          </div>
        </div>

        {/* Celular */}
        <div className="mx-auto w-[200px] rounded-[2rem] border border-white/15 bg-[#0b0b10] p-2 shadow-2xl shadow-black/60 lg:mx-0 lg:w-full">
          <div className="overflow-hidden rounded-[1.5rem] border border-white/5 bg-[#09090d]">
            <div className="mx-auto mt-2 h-1.5 w-14 rounded-full bg-white/10" />
            <div className="p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white transition-colors duration-500" style={{ background: `linear-gradient(135deg, rgb(${accent}), rgb(var(--b)))` }}>SM</span>
                <span className="text-xs font-bold text-white">Sua Marca</span>
              </div>
              <div className="mt-3 rounded-lg p-3 transition-colors duration-500" style={{ background: `linear-gradient(120deg, rgb(${accent} / 0.55), rgb(var(--b) / 0.3))` }}>
                <p className="text-[9px] font-semibold uppercase tracking-widest text-white/70">Seu banner</p>
                <p className="mt-0.5 text-xs font-bold leading-tight text-white">Sua identidade, no celular</p>
              </div>
              <div className="mt-3">
                <Tiles count={3} accent={accent} />
              </div>
              <div className="mt-3 flex justify-around border-t border-white/10 pt-2 text-white/50" aria-hidden>
                <Home className="h-4 w-4" style={{ color: `rgb(${accent})` }} />
                <LayoutGrid className="h-4 w-4" />
                <Heart className="h-4 w-4" />
                <History className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3" role="group" aria-label="Exemplos de cores da marca">
        <span className="text-xs text-fg/60">Experimente outras cores:</span>
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setThemeId(t.id)}
            aria-pressed={t.id === themeId}
            aria-label={`Tema ${t.label}`}
            className={`h-8 w-8 rounded-full border-2 transition hover:scale-110 ${t.id === themeId ? 'border-white' : 'border-white/20'}`}
            style={{ background: `linear-gradient(135deg, rgb(${t.primary}), rgb(${t.secondary}))` }}
          />
        ))}
      </div>
    </div>
  );
}
