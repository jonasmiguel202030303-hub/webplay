import { useEffect, useRef, useState } from 'react';

/**
 * Contagem regressiva baseada no relógio do SERVIDOR: usa serverNow/endsAt recebidos da API e corrige o
 * desvio local, para que alterar o relógio do computador não prolongue o teste.
 */
export function useCountdown(endsAt, serverNow) {
  const offset = useRef(0);
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!endsAt) {
      setRemaining(null);
      return undefined;
    }
    offset.current = serverNow ? new Date(serverNow).getTime() - Date.now() : 0;
    const end = new Date(endsAt).getTime();
    const tick = () => setRemaining(Math.max(0, end - (Date.now() + offset.current)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, serverNow]);

  return remaining;
}
