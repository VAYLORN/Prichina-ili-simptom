import { useLayoutEffect, useRef, type ReactNode } from 'react';

// Shrinks its text (through the --fit variable used in font sizes) until the content fits
// the box, so a long case never runs off the projector. Re-measures when `watch` changes.
export function Fit({ children, className = '', watch, min = 0.5 }: { children: ReactNode; className?: string; watch: unknown; min?: number }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current!;
    let alive = true;
    const fits = (k: number) => {
      el.style.setProperty('--fit', String(k));
      return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    };
    const measure = () => {
      if (!alive || fits(1)) return;
      let lo = min;
      let hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      fits(lo);
    };
    measure();
    void document.fonts?.ready.then(measure);
    return () => { alive = false; };
  }, [watch, min]);
  return <div ref={box} className={`fit ${className}`}>{children}</div>;
}
