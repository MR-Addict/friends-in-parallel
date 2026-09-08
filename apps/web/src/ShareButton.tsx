import { Icon as IslandIcon, Button } from 'animal-island-ui';
import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Share2 } from 'lucide-react';
import { localTime, mediaName, mediaSrc, personOf, type Entry } from './lib';

type Resource = { url: string; filename: string; mime: string };
type Props = { label: string; resource?: Resource; text?: string; disabled?: boolean };

export function entryShare(entry: Entry) {
  const url = mediaSrc(entry.media);
  const extension = url?.split('.').pop()?.toLowerCase() || 'png';
  return {
    resource: url
      ? {
          url,
          filename: `此刻同频-${localTime(entry.occurredAt).replace('T', '-').replace(':', '-')}-${entry.media.type === 'photo' ? '照片' : '表情'}.${extension}`,
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
  return <ShareSession key={JSON.stringify([props.resource, props.text])} {...props} />;
}

function ShareSession({ label, resource, text, disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<File | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const locked = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
      file.current = undefined;
    };
  }, []);
  const [supported] = useState(() =>
    canShare(
      resource ? { files: [new File([], resource.filename, { type: resource.mime })] } : { text },
    ),
  );
  if (!supported) return null;

  async function share() {
    if (locked.current || disabled) return;
    locked.current = true;
    setBusy(true);
    setError('');
    let opening = false;
    let fetched = false;
    try {
      if (resource && !file.current) {
        fetched = true;
        controller.current = new AbortController();
        const response = await fetch(resource.url, { signal: controller.current.signal });
        if (!response.ok) throw new Error('文件读取失败，请重试；资源可能已过期');
        const blob = await response.blob();
        if (!alive.current) return;
        // Reject an access-gate HTML response instead of sharing it as a resource.
        if (!blob.size || blob.type.includes('text/html')) throw new Error('文件读取失败，请重试');
        file.current = new File(
          [blob],
          responseFilename(response.headers.get('Content-Disposition'), resource.filename),
          { type: resource.mime },
        );
      }
      if (!alive.current) return;
      if (!canShare(file.current ? { files: [file.current] } : { text })) {
        file.current = undefined;

        setError('暂不支持分享');
        return;
      }

      // Slow fetches can outlive the click's transient activation.
      if (fetched && navigator.userActivation?.isActive !== true) return;
      opening = true;
      await navigator.share({
        ...(file.current ? { files: [file.current] } : {}),
        ...(text ? { text } : {}),
      });
      if (alive.current) {
        file.current = undefined;
      }
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (opening && e instanceof DOMException && e.name === 'NotAllowedError') {
        setError('请再次点击分享');
      } else setError(opening ? '分享失败，点击重试' : '读取失败，点击重试');
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="resource-share">
      <Button
        type="default"
        htmlType="button"
        className="secondary full island-action"
        disabled={disabled || busy}
        aria-busy={busy}
        aria-live="polite"
        onClick={share}
      >
        {busy ? (
          <IslandIcon icon={LoaderCircle} size={18} className="spin" />
        ) : (
          <IslandIcon icon={Share2} size={18} />
        )}
        {busy ? '正在准备分享…' : error || label}
      </Button>
    </div>
  );
}
