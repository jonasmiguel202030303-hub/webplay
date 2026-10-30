import { useCallback, useEffect, useRef, useState } from 'react';

/** Executa uma função assíncrona ao montar/ao mudar as dependências. Ignora respostas de execuções antigas. */
export function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: immediate });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const runId = useRef(0);

  const run = useCallback(async () => {
    const id = ++runId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (id === runId.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (id === runId.current) setState((s) => ({ data: s.data, error, loading: false }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (immediate) run();
    return () => {
      runId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: run, setData };
}
