import { useEffect, useRef, useState } from 'react';

export type ShareValidity = {
  url: string;
  expiresAt: string;
  onExpired: (message: string) => void;
};
const FRESH_MS = 30_000;

/** A short-lived check keeps network waits outside the user-activated share handler. */
export function useShareValidity(validity: ShareValidity | undefined, enabled: boolean) {
  const latest = useRef(validity);
  latest.current = validity;
  const [state, setState] = useState<'checking' | 'ready' | 'failed'>('checking');
  const checkedAt = useRef(0);
  const retry = useRef<() => void>(() => {});
  const expire = () => {
    checkedAt.current = 0;
    latest.current?.onExpired('动态已更新或导出已过期，请重新生成');
  };
  useEffect(() => {
    checkedAt.current = 0;
    if (!enabled || !validity) return;
    let alive = true;
    let controller: AbortController | undefined;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      clearTimeout(refresh);
      clearTimeout(timeout);
      controller?.abort();
      controller = undefined;
    };
    const check = async () => {
      if (!alive || controller || document.hidden) return;
      clearTimeout(refresh);
      checkedAt.current = 0;
      setState('checking');
      if (Date.now() >= Date.parse(validity.expiresAt)) {
        expire();
        return;
      }
      const request = new AbortController();
      controller = request;
      timeout = setTimeout(() => request.abort(), 10_000);
      try {
        const response = await fetch(validity.url, { signal: request.signal, cache: 'no-store' });
        if (!alive || controller !== request) return;
        if (response.status === 404 || Date.now() >= Date.parse(validity.expiresAt)) {
          expire();
          return;
        }
        if (response.status !== 204) throw new Error('Validation failed');
        checkedAt.current = Date.now();
        setState('ready');
      } catch {
        if (!alive || controller !== request) return;
        checkedAt.current = 0;
        setState('failed');
      } finally {
        if (alive && controller === request) {
          clearTimeout(timeout);
          controller = undefined;
          refresh = setTimeout(() => void check(), FRESH_MS);
        }
      }
    };
    retry.current = () => void check();
    const visibility = () => {
      clear();
      checkedAt.current = 0;
      setState('checking');
      if (!document.hidden) void check();
    };
    const expiry = setTimeout(expire, Math.max(0, Date.parse(validity.expiresAt) - Date.now()));
    document.addEventListener('visibilitychange', visibility);
    void check();
    return () => {
      alive = false;
      clear();
      clearTimeout(expiry);
      retry.current = () => {};
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [enabled, validity?.url, validity?.expiresAt]);

  function isFresh() {
    if (!validity) return true;
    if (Date.now() >= Date.parse(validity.expiresAt)) {
      expire();
      return false;
    }
    return !document.hidden && checkedAt.current > 0 && Date.now() - checkedAt.current < FRESH_MS;
  }
  return { state: validity ? state : 'ready', isFresh, recheck: () => retry.current() };
}
