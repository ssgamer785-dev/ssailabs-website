import type { ReactNode } from 'react';
import { css } from '../../lib/css';

/** Only HTTP(S) text becomes a link; arbitrary message content stays plain text. */
export function linkifiedText(value: string): ReactNode[] {
  return value.split(/(https?:\/\/[^\s<>]+)/gi).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return part;
    try {
      const url = new URL(part);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return part;
      return <a key={index} href={url.href} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}
        style={css('color:var(--accent-ink);text-decoration:underline;overflow-wrap:anywhere')}>{part}</a>;
    } catch { return part; }
  });
}
