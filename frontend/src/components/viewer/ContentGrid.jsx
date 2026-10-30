import ContentCard from './ContentCard.jsx';

/** Grade responsiva de conteúdos (usada em busca, favoritos, histórico e navegação por categoria). */
export default function ContentGrid({ items, live = false }) {
  return (
    <ul className={`grid gap-4 ${live ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7'}`}>
      {items.map((c) => (
        <li key={`${c.type}-${c.serverId}-${c.streamId}`}>
          <ContentCard content={c} className="!w-full" />
        </li>
      ))}
    </ul>
  );
}

export function RailSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-8 px-4 py-6 sm:px-6" role="status" aria-label="Carregando conteúdo">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r}>
          <div className="skeleton mb-3 h-5 w-40" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 8 }).map((__, i) => <div key={i} className="skeleton aspect-[2/3] w-32 shrink-0 sm:w-40" />)}
          </div>
        </div>
      ))}
    </div>
  );
}
