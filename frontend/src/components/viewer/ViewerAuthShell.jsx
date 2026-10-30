import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { api } from '../../services/api.js';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import WhatsAppFloat from '../WhatsAppFloat.jsx';

const DARK = { '--c-bg': '0 0 0', '--c-fg': '255 255 255' };
const waLink = (n) => `https://wa.me/${String(n).replace(/\D/g, '')}`;

/** Mural de pôsteres ao fundo: capas de lançamento da TMDB (estilo Netflix), igual à tela de login antiga. */
function PosterWall() {
  const [posters, setPosters] = useState([]);

  useEffect(() => {
    let alive = true;
    api.get('/public/tmdb-posters').then((d) => alive && setPosters(d.posters ?? [])).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!posters.length) return null;
  // Repete a lista o quanto for preciso para preencher a tela sem buracos.
  const tiles = Array.from({ length: Math.max(60, posters.length) }, (_, i) => posters[i % posters.length]);
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      <div className="-m-6 grid grid-cols-4 gap-1 opacity-60 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {tiles.map((p, i) => (
          <img key={i} src={p.poster} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[2/3] w-full bg-fg/5 object-cover grayscale-0 brightness-75 saturate-75" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Moldura das telas de acesso do espectador (entrar, cadastro, recuperar senha): mural de pôsteres,
 * nome/logotipo da marca no canto superior esquerdo e cartão escuro centralizado.
 */
export default function ViewerAuthShell({ title, subtitle, children, footer }) {
  const { tenant, slug } = useViewer();
  const brand = tenant.brand;
  const logo = brand.assets.logo || brand.assets.menuLogo;
  const bg = brand.assets.background;

  return (
    <div className="relative isolate min-h-screen bg-black text-fg" style={DARK}>
      {bg && <div className="fixed inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: `url(${bg})` }} aria-hidden />}
      <PosterWall />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.9)_100%)]" aria-hidden />

      <div className="relative flex min-h-screen flex-col">
        <header className="px-5 py-5 sm:px-12 sm:py-7">
          <Link to={`/${slug}`} aria-label={`Página inicial de ${brand.displayName}`} className="inline-block">
            {logo ? (
              <img src={logo} alt={brand.displayName} className="h-10 max-w-[220px] object-contain sm:h-12" />
            ) : (
              <span className="text-2xl font-extrabold uppercase tracking-[3px] text-white sm:text-[32px]">{brand.displayName}</span>
            )}
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 pb-10">
          <div className="w-full max-w-[460px]">
            <div className="rounded-lg bg-black/80 p-6 shadow-2xl backdrop-blur-md sm:px-[52px] sm:py-[48px]">
              <h1 className="text-[32px] font-bold leading-tight">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-fg/60">{subtitle}</p>}
              <div className="mt-6">{children}</div>
              {footer && <div className="mt-6 text-[15px] text-fg/60">{footer}</div>}
              {brand.whatsapp && (
                <p className="mt-4 text-sm text-fg/60">
                  Precisa de ajuda?{' '}
                  <a href={waLink(brand.whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:underline">
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Fale conosco no WhatsApp
                  </a>
                </p>
              )}
            </div>
            {brand.welcomeText && <p className="mx-auto mt-4 max-w-sm text-center text-sm text-fg/70">{brand.welcomeText}</p>}
          </div>
        </main>

        <footer className="px-4 pb-6 text-center text-xs text-fg/50">
          <p>{brand.footerText || brand.displayName}</p>
          <p className="mt-1">
            <Link to="/termos" className="hover:text-fg">Termos</Link> · <Link to="/privacidade" className="hover:text-fg">Privacidade</Link>
          </p>
        </footer>
      </div>
      <WhatsAppFloat phone={brand.whatsapp} message={`Olá! Preciso de ajuda com ${brand.displayName}.`} />
    </div>
  );
}
