import { Link } from 'react-router-dom';
import { DEFAULT_FOOTER, usePlatform } from '../hooks/usePlatform.js';

export default function PlatformFooter() {
  const platform = usePlatform();
  return (
    <footer className="border-t border-fg/10 px-4 py-8 text-center text-xs text-fg/50">
      <p>{platform?.footerText || DEFAULT_FOOTER}</p>
      <nav className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1" aria-label="Documentos legais">
        <Link to="/termos" className="hover:text-fg">Termos de Uso</Link>
        <Link to="/privacidade" className="hover:text-fg">Política de Privacidade</Link>
        <Link to="/aviso-legal" className="hover:text-fg">Aviso Legal</Link>
      </nav>
    </footer>
  );
}
