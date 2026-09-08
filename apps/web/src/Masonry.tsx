import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Keep chronological DOM order while packing variable-height cards into the shortest column. */
export function Masonry({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = ref.current!;
    const cards = Array.from(container.children) as HTMLElement[];
    const desktop = window.matchMedia('(min-width: 701px)');
    const reset = () => {
      delete container.dataset.masonry;
      container.style.removeProperty('height');
      for (const card of cards) {
        card.style.removeProperty('left');
        card.style.removeProperty('top');
      }
    };
    const layout = () => {
      if (!desktop.matches) {
        reset();
        return;
      }
      container.dataset.masonry = 'true';
      const gap = parseFloat(getComputedStyle(container).columnGap);
      const columnWidth = (container.clientWidth - gap) / 2;
      const heights = [0, 0];
      for (const card of cards) {
        const column = heights[0] <= heights[1] ? 0 : 1;
        card.style.left = `${column * (columnWidth + gap)}px`;
        card.style.top = `${heights[column]}px`;
        heights[column] += card.getBoundingClientRect().height + gap;
      }
      container.style.height = `${Math.max(0, ...heights) - (cards.length ? gap : 0)}px`;
    };

    layout();
    // Photos, font loading, edited text and container resizing can all change card height.
    const observer = new ResizeObserver(layout);
    observer.observe(container);
    cards.forEach((card) => observer.observe(card));
    desktop.addEventListener('change', layout);
    return () => {
      observer.disconnect();
      desktop.removeEventListener('change', layout);
      reset();
    };
  }, [children]);

  return (
    <div className="hour-entries" ref={ref}>
      {children}
    </div>
  );
}
