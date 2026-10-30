import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Carrossel horizontal com rolagem por toque/mouse e botões anterior/próximo. */
export default function Carousel({ title, action, children }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children]);

  const scroll = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <section className="group/carousel relative" aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-4 px-4 sm:px-6">
        <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
        {action}
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => scroll(-1)}
          disabled={edges.start}
          aria-label={`Anterior em ${title}`}
          className="absolute left-1 top-1/3 z-10 hidden h-10 w-10 items-center justify-center rounded-full bg-bg/80 text-fg shadow ring-1 ring-fg/20 hover:bg-bg disabled:hidden md:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div ref={ref} onScroll={update} className="flex gap-3 overflow-x-auto scroll-smooth px-4 py-4 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        <button
          type="button"
          onClick={() => scroll(1)}
          disabled={edges.end}
          aria-label={`Próximo em ${title}`}
          className="absolute right-1 top-1/3 z-10 hidden h-10 w-10 items-center justify-center rounded-full bg-bg/80 text-fg shadow ring-1 ring-fg/20 hover:bg-bg disabled:hidden md:flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}
