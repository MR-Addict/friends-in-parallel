import { Icon as IslandIcon, Button } from 'animal-island-ui';
import { useContext, useEffect, useRef, useState } from 'react';
import { ModalClosingContext } from './Modal';
import type { ShareValidity } from './shareValidity';
import { ArrowDownToLine, LoaderCircle, Share2 } from 'lucide-react';
import { localTime, mediaName, mediaSrc, personOf, type Entry } from './lib';

type Resource = { url: string; filename: string; mime: string };
type Download = {
  url?: string;
  validate?: () => Promise<boolean>;
  onDownload?: () => Promise<void>;
};
export type PreparedResource = {
  resource: Resource;
  validity?: ShareValidity;
  download?: Download;
};
type Props = {
  label: string;
  iconOnly?: boolean;
  resource?: Resource;
  text?: string;
  disabled?: boolean;
  validity?: ShareValidity;
  download?: Download;
  variant?: 'primary' | 'secondary';
} & (
  | {
      // Metadata allows an immediate download fallback without generating the resource.
      resourceMetadata: Pick<Resource, 'filename' | 'mime'>;
      prepareResource: (signal: AbortSignal) => Promise<PreparedResource>;
    }
  | { resourceMetadata?: never; prepareResource?: never }
);

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
        props.resourceMetadata,
        props.disabled,
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
  resourceMetadata,
  prepareResource,
  text,
  disabled,
  validity,
  download,
  variant = 'secondary',
  iconOnly = false,
}: Props) {
  const metadata = resource || resourceMetadata;
  const hasResource = !!(resource || prepareResource);
  const [resolved, setResolved] = useState<PreparedResource>();
  const current = useRef<PreparedResource | undefined>(undefined);
  const [supported] = useState(() =>
    canShare(
      metadata ? { files: [new File([], metadata.filename, { type: metadata.mime })] } : { text },
    ),
  );
  const [status, setStatus] = useState<
    'idle' | 'preparing' | 'checking' | 'ready' | 'failed' | 'unsupported'
  >(hasResource ? 'idle' : 'ready');
  const [progress, setProgress] = useState<number>();
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<File | undefined>(undefined);
  const locked = useRef(false);
  const latestValidity = useRef(validity);
  latestValidity.current = validity;
  const alive = useRef(true);
  const request = useRef<AbortController | undefined>(undefined);
  const closing = useContext(ModalClosingContext);

  useEffect(() => {
    if (!closing) return;
    alive.current = false;
    request.current?.abort();
  }, [closing]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
      file.current = undefined;
      current.current = undefined;
    };
  }, []);
  function expire(value: ShareValidity) {
    file.current = undefined;
    current.current = undefined;
    setResolved(undefined);
    setStatus('idle');
    setError('动态已更新或导出已过期，请重新生成');
    value.onExpired('动态已更新或导出已过期，请重新生成');
  }

  async function resolveResource(signal: AbortSignal) {
    if (current.current) return current.current;
    const value = prepareResource
      ? await prepareResource(signal)
      : resource
        ? { resource, validity: latestValidity.current, download }
        : undefined;
    if (signal.aborted || !value) throw new Error('Preparation cancelled');
    current.current = value;
    setResolved(value);
    return value;
  }

  async function validate(value: ShareValidity | undefined, signal: AbortSignal) {
    if (signal.aborted) return false;
    if (!value) return true;
    if (Date.now() >= Date.parse(value.expiresAt)) {
      expire(value);
      return false;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 10_000);
    try {
      const response = await fetch(value.url, { signal: controller.signal, cache: 'no-store' });
      if (signal.aborted) return false;
      if (response.status === 404 || Date.now() >= Date.parse(value.expiresAt)) {
        expire(value);
        return false;
      }
      if (response.status !== 204) throw new Error('Validation failed');
      return true;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  }

  async function prepare() {
    if (locked.current || disabled) return;
    locked.current = true;
    const controller = new AbortController();
    request.current = controller;
    setStatus('preparing');
    setProgress(undefined);
    setError('');
    try {
      const value = await resolveResource(controller.signal);
      if (controller.signal.aborted) return;
      const resource = value.resource;
      if (value.validity && Date.now() >= Date.parse(value.validity.expiresAt)) {
        expire(value.validity);
        return;
      }
      if (!file.current) {
        const response = await fetch(resource.url, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 404 && value.validity) {
          expire(value.validity);
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
      }
      setStatus('checking');
      if (await validate(value.validity, controller.signal)) {
        if (!controller.signal.aborted) setStatus('ready');
      }
    } catch {
      if (!controller.signal.aborted) setStatus('failed');
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        locked.current = false;
      }
    }
  }

  const fallback = !supported || status === 'unsupported';
  if (fallback) {
    if (!metadata) return null;
    const target = resolved?.resource || resource;
    const action = resolved?.download || download;
    return (
      <div className="resource-share">
        <a
          className={iconOnly ? 'share-icon-button' : `${variant} full`}
          aria-label={
            iconOnly ? (downloading ? '正在准备下载…' : label.replace(/^分享/, '下载')) : undefined
          }
          title={iconOnly ? label.replace(/^分享/, '下载') : undefined}
          href={action?.url || target?.url || '#'}
          download={metadata.filename}
          aria-disabled={disabled || downloading}
          aria-busy={downloading}
          onClick={async (event) => {
            if (disabled || locked.current) {
              event.preventDefault();
              return;
            }
            if (!prepareResource && !action?.validate && !action?.onDownload) return;
            event.preventDefault();
            locked.current = true;
            setDownloading(true);
            setError('');
            const controller = new AbortController();
            request.current = controller;
            try {
              const value = prepareResource ? await resolveResource(controller.signal) : undefined;
              if (controller.signal.aborted) return;
              const resource = value?.resource || target!;
              const download = value?.download || action;
              if (download?.onDownload) await download.onDownload();
              else if (
                download?.validate
                  ? await download.validate()
                  : await validate(value?.validity, controller.signal)
              ) {
                if (!alive.current || controller.signal.aborted) return;
                const link = document.createElement('a');
                link.href = download?.url || resource.url;
                link.download = resource.filename;
                document.body.append(link);
                link.click();
                link.remove();
              }
            } catch {
              if (alive.current) setError('下载失败，请重试');
            } finally {
              request.current = undefined;
              locked.current = false;
              if (alive.current) setDownloading(false);
            }
          }}
        >
          {downloading ? (
            <IslandIcon icon={LoaderCircle} size={18} className="spin" />
          ) : (
            <IslandIcon icon={iconOnly ? Share2 : ArrowDownToLine} size={18} />
          )}
          {!iconOnly && (downloading ? '正在准备下载…' : label.replace(/^分享/, '下载'))}
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
    const expiry = current.current?.validity || latestValidity.current;
    if (expiry && Date.now() >= Date.parse(expiry.expiresAt)) {
      expire(expiry);
      return;
    }
    const data = { ...(file.current ? { files: [file.current] } : {}), ...(text ? { text } : {}) };
    if (hasResource && !file.current) return;
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
  const checking = status === 'checking';
  const busy = preparing || checking || sharing;
  const caption = preparing
    ? `正在准备分享…${progress === undefined ? '' : ` ${progress}%`}`
    : checking
      ? '正在检查有效性…'
      : status === 'failed'
        ? '准备失败，点击重试'
        : sharing
          ? '正在分享…'
          : error || (status === 'ready' && hasResource ? '已准备好，再次点击分享' : label);
  return (
    <div className="resource-share">
      <Button
        type={iconOnly ? 'text' : variant === 'primary' ? 'primary' : 'default'}
        htmlType="button"
        className={
          'island-control ' + (iconOnly ? 'icon-button share-icon-button' : `${variant} full`)
        }
        aria-label={iconOnly ? caption : undefined}
        title={iconOnly ? caption : undefined}
        disabled={disabled || busy}
        aria-busy={busy}
        aria-live="polite"
        onClick={() => {
          if (status === 'idle' || status === 'failed') void prepare();
          else void share();
        }}
      >
        {busy ? (
          <IslandIcon icon={LoaderCircle} size={18} className="spin" />
        ) : (
          <IslandIcon icon={Share2} size={18} />
        )}
        {!iconOnly && caption}
      </Button>
    </div>
  );
}
