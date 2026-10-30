import { useEffect, useState } from 'react';
import { publicService } from '../services/authService.js';

export const DEFAULT_FOOTER = 'WebPlay Brasil — Plataforma de personalização de webplayers. Desenvolvido por Lumo Tecnologia.';

let cache = null;
let inflight = null;

/** Dados comerciais públicos (preço, textos, suporte). Cache simples no módulo; o servidor é a fonte da verdade. */
export function usePlatform() {
  const [platform, setPlatform] = useState(cache);
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    inflight ??= publicService.platform().then((p) => (cache = p)).finally(() => (inflight = null));
    inflight.then((p) => alive && setPlatform(p)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return platform;
}

export function invalidatePlatform() {
  cache = null;
}
