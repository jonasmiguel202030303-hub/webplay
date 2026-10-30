import { ChevronLeft, ChevronRight } from 'lucide-react';

const TONES = {
  green: 'bg-emerald-500/15 text-emerald-300',
  red: 'bg-red-500/15 text-red-300',
  amber: 'bg-amber-500/15 text-amber-300',
  blue: 'bg-sky-500/15 text-sky-300',
  slate: 'bg-fg/10 text-fg/70',
};

export function Badge({ tone = 'slate', children }) {
  return <span className={`badge ${TONES[tone] ?? TONES.slate}`}>{children}</span>;
}

export function StatusBadge({ map, value }) {
  const s = map[value] ?? { label: value ?? '—', tone: 'slate' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="Paginação">
      <span className="text-fg/60">Página {page} de {pages} ({total} registros)</span>
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" /> Anterior
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Próxima página">
          Próxima <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
