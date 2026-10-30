import { Link } from 'react-router-dom';
import { useTitle } from '../../hooks/useTitle.js';

export default function NotFound({ to = '/', label = 'Voltar ao início', message = 'Esta página não existe ou foi movida.' }) {
  useTitle('Página não encontrada');
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-extrabold text-primary">404</p>
      <h1 className="mt-3 text-xl font-bold">Página não encontrada</h1>
      <p className="mt-1 text-sm text-fg/60">{message}</p>
      <Link to={to} className="btn btn-primary mt-6">{label}</Link>
    </div>
  );
}
