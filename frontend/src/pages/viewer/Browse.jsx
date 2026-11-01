import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, Search, SearchX } from 'lucide-react';
import CatalogError from '../../components/viewer/CatalogError.jsx';
import ContentGrid from '../../components/viewer/ContentGrid.jsx';
import AdultPinModal from '../../components/viewer/AdultPinModal.jsx';
import { toContent } from '../../components/viewer/content.js';
import { EmptyState, Spinner } from '../../components/ui/Feedback.jsx';
import { Pagination } from '../../components/ui/Badge.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useTitle } from '../../hooks/useTitle.js';

const PAGE_SIZE = 40;
const LABELS = {
  live: { title: 'Canais', empty: 'Nenhum canal encontrado.', filter: 'canais' },
  vod: { title: 'Filmes', empty: 'Nenhum filme encontrado.', filter: 'filmes' },
  series: { title: 'Séries', empty: 'Nenhuma série encontrada.', filter: 'séries' },
};

/** Navegação do catálogo por categoria, com busca local e paginação. type: 'live' | 'vod'. */
export default function Browse({ type }) {
  const { tenant, profile, viewer, svc } = useViewer();
  const label = LABELS[type];
  useTitle(`${label.title} — ${tenant.brand.displayName}`);
  const [params, setParams] = useSearchParams();
  const categoryId = params.get('categoria') ?? '';
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const [q, setQ] = useState(params.get('q') ?? '');
  const dq = useDebounced(q);
  // Controle parental: categoria adulta desbloqueada fica válida só enquanto ela estiver ativa; ao trocar de categoria, tranca de novo.
  const [unlockedAdultId, setUnlockedAdultId] = useState(null);
  const unlockedRef = useRef(null);
  const [pendingCategory, setPendingCategory] = useState(null);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== dq.trim()) update({ q: dq.trim(), pagina: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  // Ao abrir a tela, qualquer liberação antiga deste tipo é descartada (voltar do player tranca de novo).
  useEffect(() => {
    svc.lockAdult(type);
    unlockedRef.current = null;
    setUnlockedAdultId(null);
  }, [svc, type]);

  useEffect(() => {
    const prev = unlockedRef.current;
    if (prev && prev !== categoryId) {
      svc.lockAdult(type, prev);
      unlockedRef.current = null;
      setUnlockedAdultId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  const cats = useAsync(() => svc.categories(type), [svc, type, profile.id]);
  const adultOn = !!viewer?.adultControlEnabled;
  const activeCategory = cats.data?.categories.find((c) => c.id === categoryId);
  const checking = adultOn && !!categoryId && !cats.data;
  const locked = adultOn && !!categoryId && !!activeCategory?.isAdult && unlockedAdultId !== categoryId;
  const list = useAsync(
    () => (locked || checking ? null : svc.streams(type, { categoryId, q: params.get('q') ?? '', page, pageSize: PAGE_SIZE })),
    [svc, type, categoryId, params.get('q'), page, profile.id, locked, checking],
  );

  if (cats.error && !cats.data) return <CatalogError error={cats.error} onRetry={cats.reload} />;
  const categories = cats.data?.categories ?? [];
  const items = list.data ? list.data.items.map((i) => toContent(i, type, list.data.serverId)) : [];
  const chip = (active) => `shrink-0 rounded-full border px-3 py-1 text-sm transition ${active ? 'border-primary bg-primary text-on-button' : 'border-fg/15 text-fg/70 hover:border-fg/40 hover:text-fg'}`;
  const serverLocked = list.error?.code === 'ADULT_LOCKED';

  const selectCategory = (c) => {
    if (c?.isAdult && adultOn && unlockedAdultId !== c.id) {
      setPendingCategory(c);
      return;
    }
    update({ categoria: c ? c.id : '', pagina: '' });
  };

  return (
    <div className="space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{label.title}</h1>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg/40" aria-hidden />
          <input className="input pl-9" type="search" placeholder={`Filtrar ${label.filter}`} aria-label="Filtrar" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {cats.data?.warning && <p className="text-xs text-amber-300">{cats.data.warning}</p>}

      {categories.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Categorias">
          <button type="button" className={chip(!categoryId)} aria-pressed={!categoryId} onClick={() => selectCategory(null)}>Todas</button>
          {categories.map((c) => (
            <button key={c.id} type="button" className={chip(categoryId === c.id)} aria-pressed={categoryId === c.id} onClick={() => selectCategory(c)}>
              {c.isAdult && adultOn && unlockedAdultId !== c.id && <Lock className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />}
              {c.name}
            </button>
          ))}
        </div>
      )}

      {locked || serverLocked ? (
        <EmptyState
          icon={Lock}
          title="Conteúdo restrito"
          action={<button type="button" className="btn btn-primary" onClick={() => setPendingCategory(activeCategory ?? { id: categoryId })}>Desbloquear com PIN</button>}
        >
          Esta categoria é protegida pelo controle parental.
        </EmptyState>
      ) : list.error && !list.data ? (
        <CatalogError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon={SearchX} title={label.empty}>Tente outra categoria ou outro termo de busca.</EmptyState>
      ) : (
        <div className={list.loading ? 'opacity-60 transition' : 'transition'} aria-busy={list.loading}>
          <ContentGrid items={items} live={type === 'live'} />
          <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={(p) => { update({ pagina: p > 1 ? String(p) : '' }); window.scrollTo({ top: 0 }); }} />
        </div>
      )}

      <AdultPinModal
        open={!!pendingCategory}
        type={type}
        categoryId={pendingCategory?.id}
        onClose={() => setPendingCategory(null)}
        onSuccess={() => {
          unlockedRef.current = pendingCategory.id;
          setUnlockedAdultId(pendingCategory.id);
          update({ categoria: pendingCategory.id, pagina: '' });
          setPendingCategory(null);
        }}
      />
    </div>
  );
}
