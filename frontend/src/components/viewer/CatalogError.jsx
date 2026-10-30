import { Clapperboard } from 'lucide-react';
import { EmptyState, ErrorState } from '../ui/Feedback.jsx';

/** Erro de catálogo com mensagens amigáveis para o espectador. */
export default function CatalogError({ error, onRetry }) {
  if (error?.code === 'NO_SERVER') {
    return (
      <div className="px-4 py-10 sm:px-6">
        <EmptyState icon={Clapperboard} title="Conteúdo em preparação">
          O responsável por esta plataforma ainda não configurou a fonte de conteúdo. Volte em breve.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="px-4 py-10 sm:px-6">
      <ErrorState error={error} onRetry={onRetry} />
    </div>
  );
}
