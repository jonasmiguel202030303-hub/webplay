/** Gráfico de barras em SVG/CSS puro (sem dependências). `data`: [{ label, value }]. */
export default function BarChart({ data, format = (v) => String(v), height = 120, ariaLabel }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <figure aria-label={ariaLabel}>
      <div className="flex items-end gap-[2px]" style={{ height }} role="img" aria-label={`${ariaLabel ?? 'Gráfico'}: total ${format(total)}`}>
        {data.map((d) => (
          <div key={d.label} className="group relative flex h-full flex-1 items-end" title={`${d.label}: ${format(d.value)}`}>
            <div className="w-full rounded-t bg-primary/70 transition group-hover:bg-primary" style={{ height: `${Math.max(d.value > 0 ? 4 : 1, (d.value / max) * 100)}%`, opacity: d.value > 0 ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between text-[10px] text-fg/40">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </figcaption>
    </figure>
  );
}

/** Preenche dias sem registro com zero para os últimos `days` dias (datas UTC YYYY-MM-DD). */
export function fillDays(series, days, pick) {
  const map = new Map(series.map((s) => [s.date, pick(s)]));
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    out.push({ label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, value: map.get(key) ?? 0 });
  }
  return out;
}
