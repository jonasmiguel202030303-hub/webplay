/** Tabela responsiva simples. `columns`: [{ key, header, render?(row), className? }]. */
export default function DataTable({ columns, rows, rowKey = 'id', onRowClick, caption }) {
  return (
    <div className="card overflow-x-auto !p-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-fg/10 text-xs uppercase text-fg/50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-3 font-medium ${c.className ?? ''}`}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-fg/10">
          {rows.map((row, i) => (
            <tr key={row[rowKey] ?? i} className={onRowClick ? 'cursor-pointer hover:bg-fg/5' : ''} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 align-top ${c.className ?? ''}`}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
