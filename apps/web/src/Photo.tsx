import { useState } from 'react';

/** Native previews only. Unsupported originals remain selectable/downloadable. */
export function Photo({
  src,
  alt,
  className,
  loading,
}: {
  src?: string;
  alt: string;
  className?: string;
  loading?: 'lazy';
}) {
  const [failedSrc, setFailedSrc] = useState('');
  return !src || failedSrc === src ? (
    <span className="photo-fallback">照片已保留，当前浏览器无法预览</span>
  ) : (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setFailedSrc(src || '')}
    />
  );
}
