import { useEffect, useRef } from 'react';

/** Validate on interaction, without keeping an idle preview polling. */
export function useExportValidity(
  url: string | undefined,
  expiresAt: string | undefined,
  onExpired: (message: string) => void,
  onError: (message: string) => void,
) {
  const current = useRef(url);
  current.current = url;
  const expired = useRef(onExpired);
  expired.current = onExpired;
  useEffect(() => {
    current.current = url;
    if (!url || !expiresAt) return;
    const timer = setTimeout(
      () => expired.current('导出已过期，请重新生成'),
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    return () => {
      current.current = undefined;
      clearTimeout(timer);
    };
  }, [url, expiresAt]);
  const validate = async () => {
    if (!url || current.current !== url) return false;
    try {
      const token = url.split('/')[4];
      const response = await fetch(`/api/exports/${encodeURIComponent(token)}/validity`);
      if (current.current !== url) return false;
      if (response.status === 404) {
        expired.current('动态已更新或导出已过期，请重新生成');
        return false;
      }
      if (!response.ok) throw new Error('暂时无法检查导出，请重试');
      onError('');
      return true;
    } catch {
      if (current.current === url) onError('暂时无法检查导出，请重试');
      return false;
    }
  };
  return {
    validate,
    shareValidity:
      url && expiresAt
        ? {
            url: `/api/exports/${encodeURIComponent(url.split('/')[4])}/validity`,
            expiresAt,
            onExpired,
          }
        : undefined,
  };
}
