import { useState } from 'react';
import { css } from '../../lib/css';

interface Props {
  storageKey: string | null;
  fileName: string | null;
  getUrl: (key: string, force: boolean) => Promise<string>;
}

/** Fresh signatures on every explicit action; saved URLs may have expired. */
export function MediaActions({ storageKey, fileName, getUrl }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!storageKey) return null;

  async function download(event: React.MouseEvent) {
    event.stopPropagation();
    if (!storageKey || busy) return;
    setBusy(true); setError(null);
    try {
      const url = await getUrl(storageKey, true);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = (fileName || 'attachment').replace(/[\\/\r\n]/g, '_');
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      setError('Could not download this attachment. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  return <div style={css('display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:11px')}>
    <button type="button" onClick={e => void download(e)} disabled={busy} style={css('color:var(--accent-ink);font-weight:700;cursor:pointer')}>{busy ? 'Downloading…' : 'Download'}</button>
    {error && <span role="alert" style={css('color:var(--danger-ink)')}>{error}</span>}
  </div>;
}
