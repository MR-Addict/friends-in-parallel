import { useEffect, useRef, useState } from 'react';
import { useShareValidity, type ShareValidity } from './useShareValidity';
import { ArrowDownToLine, LoaderCircle, Share2 } from 'lucide-react';
import { localTime, mediaName, mediaSrc, personOf, type Entry } from './lib';

type Resource = { url: string; filename: string; mime: string };
type Props = {
  label: string;
  resource?: Resource;
  text?: string;
  disabled?: boolean;
  validity?: ShareValidity;
  download?: { url?: string; validate?: () => Promise<boolean>; onDownload?: () => Promise<void> };
  variant?: 'primary' | 'secondary';
};

export function entryShare(entry: Entry) {
  const url = mediaSrc(entry.media);
  const extension = url?.split('.').pop()?.toLowerCase() || 'png';
  return {
    resource: url
      ? {
          url,
          filename: `和朋友的同一时间-${localTime(entry.occurredAt).replace('T', '-').replace(':', '-')}-${entry.media.type === 'photo' ? '照片' : '表情'}.${extension}`,
          mime:
            entry.media.type === 'photo'
              ? entry.media.mime
              : extension === 'svg'
                ? 'image/svg+xml'
                : 'image/png',
        }
      : undefined,
    text: [
      personOf(entry.personId).nickname,
      `${localTime(entry.occurredAt).replace('T', ' ')}（北京时间）`,
      entry.description,
      !url ? mediaName(entry.media) : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function canShare(data: ShareData) {
  try {
    return (
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare(data)
    );
  } catch {
    return false;
  }
}

function responseFilename(header: string | null, fallback: string) {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      /* Use the supplied name. */
    }
  }
  return header?.match(/filename="([^"]+)"/i)?.[1] || fallback;
}

// Remount the session whenever its content changes, dropping prepared file references.
export function ShareButton(props: Props) {
  return (
    <ShareSession
      key={JSON.stringify([
        props.resource,
        props.text,
        props.validity?.url,
        props.validity?.expiresAt,
      ])}
      {...props}
    />
  );
}

function ShareSession({
  label,
  resource,
  text,
  disabled,
  validity,
  download,
  variant = 'secondary',
}: Props) {
  const [supported] = useState(() =>
    canShare(
      resource ? { files: [new File([], resource.filename, { type: resource.mime })] } : { text },
    ),
  );
  const [status, setStatus] = useState<'preparing' | 'ready' | 'failed' | 'unsupported'>(
    resource ? 'preparing' : 'ready',
  );
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState<number>();
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<File | undefined>(undefined);
  const locked = useRef(false);
  const latestValidity = useRef(validity);
  latestValidity.current = validity;
  const alive = useRef(true);
  const check = useShareValidity(validity, supported && status === 'ready' && !disabled);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!supported || !resource || disabled) return;
    const controller = new AbortController();
    const prepare = async () => {
      setStatus('preparing');
      setProgress(undefined);
      try {
        const response = await fetch(resource.url, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 404 && latestValidity.current) {
          latestValidity.current.onExpired('动态已更新或导出已过期，请重新生成');
          return;
        }
        if (!response.ok) throw new Error('File read failed');
        const total = Number(response.headers.get('Content-Length'));
        const reliable =
          Number.isSafeInteger(total) &&
          total > 0 &&
          (!response.headers.get('Content-Encoding') ||
            response.headers.get('Content-Encoding') === 'identity');
        let blob: Blob;
        if (response.body && reliable) {
          const reader = response.body.getReader();
          const chunks: Uint8Array<ArrayBuffer>[] = [];
          let loaded = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.byteLength;
            if (!controller.signal.aborted)
              setProgress(Math.min(100, Math.floor((loaded / total) * 100)));
          }
          blob = new Blob(chunks, { type: response.headers.get('Content-Type') || '' });
        } else blob = await response.blob();
        if (controller.signal.aborted) return;
        if (!blob.size || blob.type.includes('text/html')) throw new Error('Invalid file');
        let filename = responseFilename(
          response.headers.get('Content-Disposition'),
          resource.filename,
        );
        const exportedName = response.headers.get('X-Export-Filename');
        if (exportedName) {
          try {
            filename = decodeURIComponent(exportedName);
          } catch {
            /* Use the supplied name. */
          }
        }
        const prepared = new File([blob], filename, { type: resource.mime });
        if (!canShare({ files: [prepared], ...(text ? { text } : {}) })) {
          setStatus('unsupported');
          return;
        }
        file.current = prepared;
        setStatus('ready');
      } catch {
        if (!controller.signal.aborted) setStatus('failed');
      }
    };
    void prepare();
    return () => {
      controller.abort();
      file.current = undefined;
    };
  }, [supported, resource?.url, resource?.filename, resource?.mime, text, disabled, attempt]);

  const fallback = !supported || status === 'unsupported';
  if (fallback) {
    if (!resource) return null;
    return (
      <div className="resource-share">
        <a
          className={`${variant} full`}
          href={download?.url || resource.url}
          download={resource.filename}
          aria-disabled={disabled || downloading}
          aria-busy={downloading}
          onClick={async (event) => {
            if (disabled || locked.current) {
              event.preventDefault();
              return;
            }
            if (!download?.validate && !download?.onDownload) return;
            event.preventDefault();
            locked.current = true;
            setDownloading(true);
            setError('');
            try {
              if (download.onDownload) await download.onDownload();
              else if (await download.validate!()) {
                if (!alive.current) return;
                const link = document.createElement('a');
                link.href = download.url || resource.url;
                link.download = resource.filename;
                document.body.append(link);
                link.click();
                link.remove();
              }
            } catch {
              if (alive.current) setError('下载失败，请重试');
            } finally {
              locked.current = false;
              if (alive.current) setDownloading(false);
            }
          }}
        >
          {downloading ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <ArrowDownToLine size={18} />
          )}
          {downloading ? '正在准备下载…' : label.replace(/^分享/, '下载')}
        </a>
        {error && (
          <p className="small-note" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
  async function share() {
    if (locked.current || disabled || status !== 'ready') return;
    if (!check.isFresh()) {
      check.recheck();
      return;
    }
    const data = { ...(file.current ? { files: [file.current] } : {}), ...(text ? { text } : {}) };
    if (resource && !file.current) return;
    if (!canShare(data)) {
      setError('');
      setStatus('unsupported');
      return;
    }
    locked.current = true;
    setSharing(true);
    setError('');
    try {
      await navigator.share(data);
    } catch (e) {
      if (!alive.current || (e instanceof DOMException && e.name === 'AbortError')) return;
      if (
        (e instanceof DOMException && ['NotAllowedError', 'NotSupportedError'].includes(e.name)) ||
        e instanceof TypeError
      ) {
        setError('');
        setStatus('unsupported');
      } else setError('分享失败，点击重试');
    } finally {
      locked.current = false;
      if (alive.current) setSharing(false);
    }
  }
  const preparing = status === 'preparing';
  const checking = status === 'ready' && check.state === 'checking';
  const busy = preparing || checking || sharing;
  const caption = preparing
    ? `正在准备分享…${progress === undefined ? '' : ` ${progress}%`}`
    : status === 'failed'
      ? '准备失败，点击重试'
      : checking
        ? '正在检查有效性…'
        : check.state === 'failed'
          ? '重新检查'
          : sharing
            ? '正在分享…'
            : error || label;
  return (
    <div className="resource-share">
      <button
        type="button"
        className={`${variant} full`}
        disabled={disabled || busy}
        aria-busy={busy}
        aria-live="polite"
        onClick={() => {
          if (status === 'failed') setAttempt((n) => n + 1);
          else if (check.state === 'failed') check.recheck();
          else void share();
        }}
      >
        {busy ? <LoaderCircle size={18} className="spin" /> : <Share2 size={18} />}
        {caption}
      </button>
    </div>
  );
}
