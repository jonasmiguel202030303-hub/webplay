import { useSyncExternalStore } from 'react';

const key = (slug) => `wp:${slug}:chat-off`;
const listeners = new Set();

const read = (slug) => {
  try {
    return localStorage.getItem(key(slug)) !== '1';
  } catch {
    return true;
  }
};

/** Liga/desliga o chat só neste aparelho (preferência do espectador, guardada no navegador). */
export function setChatPref(slug, on) {
  try {
    if (on) localStorage.removeItem(key(slug));
    else localStorage.setItem(key(slug), '1');
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
  listeners.forEach((fn) => fn());
}

export function useChatPref(slug) {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => read(slug),
    () => true,
  );
}
