import { useState } from 'react';
import { css } from '../../lib/css';

interface Props {
  storageKey: string | null;
  fileName: string | null;
  getUrl: (key: string, force: boolean) => Promise<string>;
  showOpen?: boolean;
}

/** Fresh signatures on every explicit action; saved URLs may have expired. */
export function MediaActions({ storageKey, fileName, getUrl, showOpen = true }: Props) {
  const [busy, setBusy] = useState<'open' | 'download' | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!storageKey) return null;

  async function open(event: React.MouseEvent) {
    event.stopPropagation();
    if (!storageKey || busy) return;
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setBusy('open'); setError(null);
    try {
      const url = await getUrl(storageKey, true);
      if (tab) tab.location.replace(url);
      else window.location.assign(url);
    } catch {
      tab?.close();
      setError('Could not open this attachment. Try again.');
    } finally { setBusy(null); }
  }

  async function download(event: React.MouseEvent) {
    event.stopPropagation();
    if (!storageKey || busy) return;
    setBusy('download'); setError(null);
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
    } finally { setBusy(null); }
  }

  return <div style={css('display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:11px')}>
    {showOpen && <button type="button" onClick={e => void open(e)} disabled={!!busy} style={css('color:var(--accent-ink);font-weight:700;cursor:pointer')}>{busy === 'open' ? 'Opening…' : 'Open'}</button>}
    <button type="button" onClick={e => void download(e)} disabled={!!busy} style={css('color:var(--accent-ink);font-weight:700;cursor:pointer')}>{busy === 'download' ? 'Downloading…' : 'Download'}</button>
    {error && <span role="alert" style={css('color:var(--danger-ink)')}>{error}</span>}
  </div>;
}
