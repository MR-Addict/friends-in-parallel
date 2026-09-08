import { useEffect, useRef, useState } from 'react';

const threshold = 64;

export function usePullToRefresh(loading: boolean, onRefresh: () => void) {
  const surface = useRef<HTMLElement>(null);
  const callback = useRef(onRefresh);
  const pending = useRef(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    callback.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!loading) {
      pending.current = false;
      setRefreshing(false);
    }
  }, [loading]);

  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    let start: { x: number; y: number; id: number } | undefined;
    let pull = 0;
    let claimed = false;
    let suppressClick = false;
    const reset = () => {
      start = undefined;
      pull = 0;
      claimed = false;
      setDistance(0);
    };
    const blocked = () => loading || pending.current || !!document.querySelector('dialog[open]');
    const touchStart = (event: TouchEvent) => {
      reset();
      suppressClick = false;
      if (blocked() || window.scrollY > 0 || event.touches.length !== 1) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!el.contains(target)) return;
      if (target.closest('input, textarea, select, [contenteditable], dialog')) return;
      // Let nested vertical scrollers own their gestures. Horizontal filters can
      // still initiate a downward pull; the first movement decides the direction.
      for (let node = target; node && node !== el; node = node.parentElement!) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return;
      }
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
    };
    const touchMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.touches[0];
      if (
        blocked() ||
        event.touches.length !== 1 ||
        touch.identifier !== start.id ||
        window.scrollY > 0
      ) {
        reset();
        return;
      }
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!claimed) {
        // iOS can commit to native scrolling after the first uncanceled move.
        // Claim downward movement immediately; only the refresh has a threshold.
        if (dx === 0 && dy === 0) return;
        if (dy <= 0 || Math.abs(dx) >= dy) {
          reset();
          return;
        }
        claimed = true;
      }
      if (!event.cancelable) {
        reset();
        return;
      }
      event.preventDefault();
      if (dy > 8) suppressClick = true;
      pull = 180 * (1 - Math.exp(-Math.max(0, dy) / 280));
      setDistance(pull);
    };
    const touchEnd = (event: TouchEvent) => {
      if (claimed && suppressClick && event.cancelable) event.preventDefault();
      const refresh = claimed && pull >= threshold && !blocked();
      reset();
      if (refresh) {
        pending.current = true;
        setRefreshing(true);
        callback.current();
      }
    };
    const click = (event: MouseEvent) => {
      if (suppressClick && event.detail > 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick = false;
      }
    };
    // Capture before target handlers, with an explicitly non-passive move listener
    // so Safari can hand this gesture to the app instead of rubber-banding.
    document.addEventListener('touchstart', touchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', touchMove, { passive: false, capture: true });
    document.addEventListener('touchend', touchEnd, { passive: false, capture: true });
    document.addEventListener('touchcancel', reset, true);
    document.addEventListener('click', click, true);
    document.documentElement.classList.add('pull-refresh-enabled');
    return () => {
      reset();
      document.removeEventListener('touchstart', touchStart, true);
      document.removeEventListener('touchmove', touchMove, true);
      document.removeEventListener('touchend', touchEnd, true);
      document.removeEventListener('touchcancel', reset, true);
      document.removeEventListener('click', click, true);
      document.documentElement.classList.remove('pull-refresh-enabled');
    };
  }, [loading]);

  return { surface, distance, refreshing, ready: distance >= threshold };
}
