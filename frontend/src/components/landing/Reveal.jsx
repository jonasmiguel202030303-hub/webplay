import { useEffect, useRef, useState } from 'react';

/** Revela o bloco com fade/slide quando ele entra na tela. */
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (shown || !ref.current) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);

  return (
    <Tag ref={ref} style={{ '--d': `${delay}ms` }} className={`reveal ${shown ? 'is-visible' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
