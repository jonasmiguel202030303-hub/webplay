import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useContentModal } from './contentModalContext.js';
import { TYPE_LABEL, toContent } from './content.js';

const ago = (iso) => {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 60) return min <= 1 ? 'agora' : `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
};

/** Sininho: lista o que entrou na fonte (canais, filmes e séries) nos últimos dias; número vermelho = ainda não visto. */
export default function NewsBell({ reloadKey = 0 }) {
  const { svc } = useViewer();
  const modal = useContentModal();
  const [data, setData] = useState({ items: [], serverId: undefined });
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const openRef = useRef(false);
  openRef.current = open;

  const load = useCallback(async (fetch) => {
    try {
      const res = await svc.news(undefined, fetch);
      setData({ items: res.items, serverId: res.serverId });
      if (!openRef.current) setUnread(res.unread);
      return res;
    } catch {
      return null;
    }
  }, [svc]);

  // Consulta de fundo (só cache do servidor): logo depois de abrir a página, após atualizar o catálogo e a cada 5 minutos.
  useEffect(() => {
    const first = setTimeout(() => load(false), 4000);
    const retry = setTimeout(() => load(false), 25000);
    const timer = setInterval(() => { if (!document.hidden) load(false); }, 5 * 60 * 1000);
    return () => { clearTimeout(first); clearTimeout(retry); clearInterval(timer); };
  }, [load]);

  useEffect(() => {
    if (reloadKey) load(false);
  }, [reloadKey, load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    const res = await load(true);
    setLoading(false);
    if (res?.unread > 0) {
      setUnread(0);
      svc.markNewsSeen().catch(() => {});
    }
  };

  const clear = async () => {
    setData((d) => ({ ...d, items: [] }));
    setUnread(0);
    svc.clearNews().catch(() => {});
  };

  const show = (item) => {
    setOpen(false);
    modal.open(toContent(item, item.type, data.serverId));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread > 0 ? `Novidades: ${unread} novas` : 'Novidades'}
        title="Novidades"
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-fg/10 text-fg/80 transition hover:bg-fg/20 hover:text-fg"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-bg">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Novidades" className="fixed inset-x-3 top-14 z-40 animate-fade-in overflow-hidden rounded-xl border border-fg/15 bg-bg shadow-2xl md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:w-96">
          <div className="flex items-center justify-between border-b border-fg/10 px-4 py-2.5">
            <p className="text-sm font-semibold">Novidades</p>
            {data.items.length > 0 && (
              <button type="button" onClick={clear} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fg/70 hover:bg-fg/10 hover:text-fg">
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Limpar
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && data.items.length === 0 && <p className="px-4 py-6 text-center text-sm text-fg/60">Buscando novidades...</p>}
            {!loading && data.items.length === 0 && <p className="px-4 py-6 text-center text-sm text-fg/60">Nenhuma novidade por enquanto.</p>}
            <ul>
              {data.items.map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <button type="button" onClick={() => show(item)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-fg/5">
                    <span className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-fg/10">
                      {item.icon ? <img src={item.icon} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="block text-xs text-fg/60">{TYPE_LABEL[item.type]} · {ago(item.addedAt)}</span>
                    </span>
                    {item.isNew && <span className="shrink-0 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Novo</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
