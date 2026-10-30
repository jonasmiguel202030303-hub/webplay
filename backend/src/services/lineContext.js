import { AsyncLocalStorage } from 'node:async_hooks';

/** Linha Xtream (usuário/senha do próprio espectador) da requisição em andamento; permite que o catálogo use as credenciais dele. */
const store = new AsyncLocalStorage();

export const runWithLine = (line, fn) => store.run(line, fn);
export const currentLine = () => store.getStore() ?? null;
