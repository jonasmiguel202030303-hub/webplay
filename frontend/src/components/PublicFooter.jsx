import { Link } from 'react-router-dom';
import { Mail, MessageCircle } from 'lucide-react';
import Logo from './Logo.jsx';
import { LEGAL_LINKS } from './landing/legalCopy.js';
import { usePlatform } from '../hooks/usePlatform.js';

const PLATFORM_LINKS = [
  { to: '/#para-quem', label: 'Para quem' },
  { to: '/#recursos', label: 'Recursos' },
  { to: '/#como-funciona', label: 'Como funciona' },
  { to: '/#planos', label: 'Planos' },
];

const linkClass = 'text-fg/60 transition hover:text-fg';

export default function PublicFooter() {
  const platform = usePlatform();
  const wa = platform?.supportWhatsapp?.replace(/\D/g, '');

  return (
    <footer className="border-t border-fg/10 bg-gradient-to-b from-transparent to-primary/[0.06]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-fg/65">Infraestrutura tecnológica para sua própria plataforma de streaming.</p>
        </div>

        <nav aria-label="Plataforma">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-fg/80">Plataforma</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {PLATFORM_LINKS.map((l) => <li key={l.to}><Link to={l.to} className={linkClass}>{l.label}</Link></li>)}
          </ul>
        </nav>

        <nav aria-label="Institucional">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-fg/80">Institucional</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {LEGAL_LINKS.map((l) => <li key={l.to}><Link to={l.to} className={linkClass}>{l.label}</Link></li>)}
          </ul>
        </nav>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-fg/80">Suporte</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/entrar" className={linkClass}>Acessar minha conta</Link></li>
            <li><Link to="/cadastro" className={linkClass}>Criar conta</Link></li>
            {wa && (
              <li>
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={`${linkClass} inline-flex items-center gap-2`}>
                  <MessageCircle className="h-4 w-4" aria-hidden />WhatsApp
                </a>
              </li>
            )}
            {platform?.supportEmail && (
              <li>
                <a href={`mailto:${platform.supportEmail}`} className={`${linkClass} inline-flex items-center gap-2 break-all`}>
                  <Mail className="h-4 w-4 shrink-0" aria-hidden />{platform.supportEmail}
                </a>
              </li>
            )}
            {platform?.supportHoursText && <li className="text-xs text-fg/50">{platform.supportHoursText}</li>}
          </ul>
        </div>
      </div>

      <div className="border-t border-fg/10">
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-xs text-fg/55">
          <p>O WebPlay Brasil é uma plataforma tecnológica e não fornece conteúdo audiovisual. As fontes são configuradas pelos próprios clientes.</p>
          <div className="flex flex-col justify-between gap-1 sm:flex-row">
            <p>&copy; {new Date().getFullYear()} WebPlay Brasil. Todos os direitos reservados.</p>
            <p>Desenvolvido por Lumo Tecnologia.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
