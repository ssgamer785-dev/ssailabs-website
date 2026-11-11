import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeViewportFit } from '../viewportFit';

/**
 * Back and Continue must stay reachable on an iPad.
 *
 * Two reasons they did not: the wizard was sized with 100vh, which on iPad
 * Safari is taller than the visible screen (so the footer sat below the fold),
 * and the on-screen keyboard does not resize the page, so it covered the footer.
 */

describe('sizing the overlay to what is visible while a keyboard is up', () => {
  it('leaves the overlay alone when there is no keyboard', () => {
    expect(computeViewportFit(1024, { height: 1024, offsetTop: 0 })).toBeNull();
  });

  it('leaves it alone for a toolbar appearing or hiding — inset-0 already tracks that', () => {
    expect(computeViewportFit(1024, { height: 960, offsetTop: 0 })).toBeNull();
    expect(computeViewportFit(1024, { height: 910, offsetTop: 0 })).toBeNull();
  });

  it('fits the visible rectangle when a keyboard takes a large part of the screen', () => {
    // iPad portrait with the software keyboard: roughly 340px of a 1024 screen.
    expect(computeViewportFit(1024, { height: 684, offsetTop: 0 })).toEqual({ top: 0, height: 684 });
  });

  it('follows the visual viewport when iOS pans it to reveal the focused field', () => {
    expect(computeViewportFit(768, { height: 380, offsetTop: 54 })).toEqual({ top: 54, height: 380 });
  });

  it('never returns a negative top', () => {
    expect(computeViewportFit(768, { height: 380, offsetTop: -12 })?.top).toBe(0);
  });

  it('does not fight a pinch-zoom the user chose', () => {
    expect(computeViewportFit(1024, { height: 500, offsetTop: 0, scale: 2 })).toBeNull();
  });

  it('copes with no visualViewport at all', () => {
    expect(computeViewportFit(1024, null)).toBeNull();
    expect(computeViewportFit(1024, undefined)).toBeNull();
  });

  it('ignores nonsense numbers rather than collapsing the wizard', () => {
    expect(computeViewportFit(1024, { height: NaN, offsetTop: 0 })).toBeNull();
    expect(computeViewportFit(NaN, { height: 600, offsetTop: 0 })).toBeNull();
  });
});

/* ----------------------------------------------------- structural guards */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const modal = readFileSync(resolve(ROOT, 'src/components/modals/OrderModal.tsx'), 'utf8');
const css = readFileSync(resolve(ROOT, 'src/index.css'), 'utf8');

/** The opening tag of the wizard's root element. */
const rootTag = (() => {
  const at = modal.indexOf('data-order-wizard');
  const start = modal.lastIndexOf('<div', at);
  return modal.slice(start, modal.indexOf('>', modal.indexOf('className', at)) + 1);
})();

describe('the wizard is sized by the visible viewport, never by 100vh', () => {
  it('the root is fixed and inset to the screen', () => {
    expect(rootTag).toMatch(/\bfixed\b/);
    expect(rootTag).toMatch(/\binset-0\b/);
  });

  it('the root does not use h-screen, w-screen or any 100vh', () => {
    expect(rootTag).not.toMatch(/\bh-screen\b/);
    expect(rootTag).not.toMatch(/\bw-screen\b/);
    expect(rootTag).not.toMatch(/\bmin-h-screen\b/);
    expect(rootTag).not.toMatch(/100vh/);
    expect(rootTag).not.toMatch(/\bh-\[100vh\]/);
  });

  it('nothing inside the wizard is sized by 100vh', () => {
    const body = modal.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(body).not.toMatch(/h-screen|min-h-screen|100vh|h-\[100vh\]/);
  });
});

describe('the footer cannot cover a measurement box', () => {
  it('is a sibling of the scroll area, after it, and a flex item', () => {
    const mainClose = modal.indexOf('</main>');
    const footerAt = modal.indexOf('data-wizard-footer');
    expect(mainClose).toBeGreaterThan(-1);
    expect(footerAt).toBeGreaterThan(mainClose);
  });

  it('is not positioned over the content', () => {
    const at = modal.indexOf('data-wizard-footer');
    const tag = modal.slice(at, modal.indexOf('>', modal.indexOf('className', at)) + 1);
    expect(tag).not.toMatch(/\b(fixed|absolute|sticky)\b/);
    expect(tag).toMatch(/\bshrink-0\b/);
  });

  it('the scroll area can shrink inside the flex column', () => {
    const at = modal.indexOf('data-wizard-scroll');
    const tag = modal.slice(at, modal.indexOf('>', modal.indexOf('className', at)) + 1);
    expect(tag).toMatch(/\bmin-h-0\b/);
    expect(tag).toMatch(/\boverflow-y-auto\b/);
    expect(tag).toMatch(/\bflex-1\b/);
  });
});

describe('safe areas and the keyboard', () => {
  it('the footer and header clear the system insets', () => {
    expect(modal).toMatch(/pb-\[max\([^)]*var\(--safe-bottom\)\)\]/);
    expect(modal).toMatch(/pt-\[max\([^)]*var\(--safe-top\)\)\]/);
  });

  it('the shell defines the insets from env() with a zero fallback', () => {
    expect(css).toMatch(/--safe-bottom:\s*env\(safe-area-inset-bottom,\s*0px\)/);
    expect(css).toMatch(/--safe-top:\s*env\(safe-area-inset-top,\s*0px\)/);
    expect(css).toMatch(/\.wizard-shell\s*\{[^}]*padding-left:\s*var\(--safe-left\)/);
  });

  it('touch inputs are 16px so iOS does not zoom the page away from the footer', () => {
    expect(css).toMatch(/@media \(pointer: coarse\)\s*\{[^}]*\.wizard-shell input[^}]*font-size:\s*16px/);
  });

  it('that rule is unlayered, so it outranks the inputs\' text-sm', () => {
    // An unlayered declaration beats every @layer, utilities included; inside a
    // layer it would lose to `text-sm` and the inputs would stay at 14px.
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const at = stripped.indexOf('@media (pointer: coarse)');
    expect(at).toBeGreaterThan(-1);
    const before = stripped.slice(0, at);
    const depth = (before.match(/\{/g) || []).length - (before.match(/\}/g) || []).length;
    expect(depth, 'the rule must sit at the top level, outside every @layer and @media').toBe(0);
  });

  it('the visual-viewport hook is called before the wizard\'s early return', () => {
    const hook = modal.indexOf('useVisualViewportFit(isOpen)');
    const early = modal.indexOf('if (!isOpen) return null;');
    expect(hook).toBeGreaterThan(-1);
    expect(hook).toBeLessThan(early);
  });

  it('the viewport meta is unchanged — the page stays inside the safe area by default', () => {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0" />');
    expect(html).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/);
  });
});
