import { useEffect, useState } from 'react';
import { Button, Icon } from 'animal-island-ui';
import { LoaderCircle } from 'lucide-react';
import { api, dateOf, type Entry, type ImageExport } from './lib';
import { ShareButton, entryShare } from './ShareButton';
import { useExportValidity } from './useExportValidity';

export function PostShare({ entry }: { entry: Entry }) {
  return entry.description ? (
    <RenderedPostShare key={JSON.stringify(entry)} entry={entry} />
  ) : (
    <ShareButton label="分享图片" {...entryShare(entry)} />
  );
}

function RenderedPostShare({ entry }: { entry: Entry }) {
  const [result, setResult] = useState<ImageExport>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const { validate, shareValidity } = useExportValidity(
    result?.images[0],
    result?.expiresAt,
    (message) => {
      setResult(undefined);
      setError(message);
    },
    setError,
  );
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api<ImageExport>('/api/exports/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateOf(entry.occurredAt), entryId: entry.id }),
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [entry, attempt]);
  return (
    <>
      {result ? (
        <ShareButton
          label="分享动态"
          validity={shareValidity}
          resource={{
            url: result.images[0],
            filename: `和朋友的同一时间-${dateOf(entry.occurredAt)}-动态.png`,
            mime: 'image/png',
          }}
          download={{ url: `${result.images[0]}?download=1`, validate }}
        />
      ) : (
        <Button
          type="default"
          className="island-control secondary full"
          disabled={!error}
          aria-busy={!error}
          onClick={() => setAttempt((n) => n + 1)}
        >
          {!error && <Icon icon={LoaderCircle} size={18} className="spin" />}
          {error ? '重新生成动态' : '正在准备动态…'}
        </Button>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
