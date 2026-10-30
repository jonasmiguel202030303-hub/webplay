import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SearchX } from 'lucide-react';
import CatalogError from '../../components/viewer/CatalogError.jsx';
import ContentGrid from '../../components/viewer/ContentGrid.jsx';
import { toContent } from '../../components/viewer/content.js';
import Button from '../../components/ui/Button.jsx';
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';

export default function SearchPage() {
  const { tenant, profile, svc } = useViewer();
  useTitle(`Buscar — ${tenant.brand.displayName}`);
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [text, setText] = useState(q);
  const [hint, setHint] = useState(null);

  useEffect(() => setText(q), [q]);

  const result = useAsync(() => (q.length >= 2 ? svc.search(q) : Promise.resolve(null)), [svc, q, profile.id]);

  const submit = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (value.length < 2) {
      setHint('Digite ao menos 2 caracteres.');
      return;
    }
    setHint(null);
    setParams({ q: value });
  };

  const live = result.data?.live.map((i) => toContent(i, 'live', result.data.serverId)) ?? [];
  const vod = result.data?.vod.map((i) => toContent(i, 'vod', result.data.serverId)) ?? [];
  const series = result.data?.series?.map((i) => toContent(i, 'series', result.data.serverId)) ?? [];

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">Buscar</h1>
      <form onSubmit={submit} role="search" className="flex gap-2" noValidate>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg/40" aria-hidden />
          <input className="input pl-9" type="search" autoFocus placeholder="Canais, filmes e séries" aria-label="Termo de busca" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Button type="submit">Buscar</Button>
      </form>
      {hint && <p className="field-error">{hint}</p>}

      {q.length < 2 ? (
        <EmptyState icon={Search} title="O que você quer assistir?">Pesquise pelo nome de um canal, filme ou série.</EmptyState>
      ) : result.loading && !result.data ? (
        <Spinner label="Buscando…" />
      ) : result.error && !result.data ? (
        <CatalogError error={result.error} onRetry={result.reload} />
      ) : (
        result.data && (
          <>
            {result.data.warning && <Alert tone="warning">{result.data.warning}</Alert>}
            {!live.length && !vod.length && !series.length ? (
              <EmptyState icon={SearchX} title={`Nada encontrado para "${q}"`}>Confira a grafia ou tente outro termo.</EmptyState>
            ) : (
              <div className={result.loading ? 'space-y-8 opacity-60' : 'space-y-8'}>
                {live.length > 0 && (
                  <section aria-label="Canais"><h2 className="mb-3 text-lg font-semibold">Canais ({live.length})</h2><ContentGrid items={live} live /></section>
                )}
                {vod.length > 0 && (
                  <section aria-label="Filmes"><h2 className="mb-3 text-lg font-semibold">Filmes ({vod.length})</h2><ContentGrid items={vod} /></section>
                )}
                {series.length > 0 && (
                  <section aria-label="Séries"><h2 className="mb-3 text-lg font-semibold">Séries ({series.length})</h2><ContentGrid items={series} /></section>
                )}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
