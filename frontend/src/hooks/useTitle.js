import { useEffect } from 'react';

/** Atualiza o título da aba. */
export function useTitle(title) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
