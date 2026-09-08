import { useState } from 'react';
import { api, dateOf, type Entry, type ImageExport } from './lib';
import { ShareButton, entryShare, type PreparedResource } from './ShareButton';

export function PostShare({ entry, iconOnly = false }: { entry: Entry; iconOnly?: boolean }) {
  return entry.description ? (
    <RenderedPostShare key={JSON.stringify(entry)} entry={entry} iconOnly={iconOnly} />
  ) : (
    <ShareButton iconOnly={iconOnly} label="分享图片" {...entryShare(entry)} />
  );
}

function RenderedPostShare({ entry, iconOnly = false }: { entry: Entry; iconOnly?: boolean }) {
  const [session, setSession] = useState(0);
  const [error, setError] = useState('');
  const metadata = {
    filename: `和朋友的同一时间-${dateOf(entry.occurredAt)}-动态.png`,
    mime: 'image/png',
  };
  async function prepareResource(signal: AbortSignal): Promise<PreparedResource> {
    setError('');
    const result = await api<ImageExport>('/api/exports/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateOf(entry.occurredAt), entryId: entry.id }),
      signal,
    });
    const url = result.images[0];
    return {
      resource: { url, ...metadata },
      validity: {
        url: `/api/exports/${encodeURIComponent(url.split('/')[4])}/validity`,
        expiresAt: result.expiresAt,
        onExpired: (message) => {
          setError(message);
          setSession((value) => value + 1);
        },
      },
      download: { url: `${url}?download=1` },
    };
  }
  return (
    <>
      <ShareButton
        key={session}
        label="分享动态"
        iconOnly={iconOnly}
        resourceMetadata={metadata}
        prepareResource={prepareResource}
      />
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
