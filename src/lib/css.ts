import type { CSSProperties } from 'react';

/** Parses a CSS declaration string ("width:390px;display:flex") into a React style object. */
export function css(text: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of text.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop || !val) continue;
    const camel = prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = val;
  }
  return out as CSSProperties;
}
