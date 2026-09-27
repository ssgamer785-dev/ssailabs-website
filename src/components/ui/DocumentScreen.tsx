import { useRef, type ReactNode } from 'react';
import { css } from '../../lib/css';
import { PhoneShell } from '../PhoneShell';
import { AppBackButton } from './AppBackButton';
import { AuthenticatedBottomNav } from './AuthenticatedBottomNav';

/**
 * The shell the long-form screens share: Privacy Policy, Terms and the written
 * parts of Help & Support.
 *
 * Same header, back button and tab bar as every other screen reached from
 * Profile, so these read as part of the app rather than as a web page dropped
 * inside it. Everything here is a theme token, so both themes come for free.
 */
export function DocumentScreen({ title, intro, updated, children }: {
  title: string;
  /** One line under the title, before the body. */
  intro?: string;
  /** Legal documents need a date; Help & Support does not. */
  updated?: string;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <PhoneShell scrollRef={scrollRef}>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <AppBackButton fallback="/profile" />
        <div style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px;padding-right:32px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {title}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="nav-space"
        style={css('flex:1;min-height:0;overflow-y:auto;padding:4px 22px 0;display:flex;flex-direction:column;overscroll-behavior:contain;-webkit-overflow-scrolling:touch')}
      >
        {(intro || updated) && (
          <div style={css('flex:none;padding-bottom:6px;display:flex;flex-direction:column;gap:6px')}>
            {intro && (
              <div style={css('font-size:13px;color:var(--text-muted);line-height:1.55;text-wrap:pretty')}>{intro}</div>
            )}
            {updated && (
              <div style={css('font-size:11px;font-weight:600;color:var(--text-faint);letter-spacing:.04em')}>
                Last updated {updated}
              </div>
            )}
          </div>
        )}
        {children}
        <div style={css('flex:none;height:18px')} />
      </div>

      <AuthenticatedBottomNav />
    </PhoneShell>
  );
}

/** A titled block of prose. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={css('flex:none;padding-top:20px;display:flex;flex-direction:column;gap:8px')}>
      <h2 style={css('margin:0;font-size:14.5px;font-weight:700;letter-spacing:-.2px;color:var(--text-primary);text-wrap:pretty')}>
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Body copy. */
export function P({ children }: { children: ReactNode }) {
  return (
    <p style={css('margin:0;font-size:13px;line-height:1.62;color:var(--text-tertiary);text-wrap:pretty')}>
      {children}
    </p>
  );
}

/** A list of points under a section. */
export function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul style={css('margin:2px 0 0;padding:0 0 0 16px;display:flex;flex-direction:column;gap:7px;list-style:none')}>
      {items.map((item, i) => (
        <li key={i} style={css('position:relative;font-size:13px;line-height:1.62;color:var(--text-tertiary);text-wrap:pretty')}>
          <span
            aria-hidden="true"
            style={css('position:absolute;left:-15px;top:9px;width:4px;height:4px;border-radius:50%;background:var(--text-dim)')}
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A boxed aside for the things a reader must not skim past. */
export function Callout({ tone = 'accent', title, children }: {
  tone?: 'accent' | 'warning';
  title: string;
  children: ReactNode;
}) {
  const warn = tone === 'warning';
  return (
    <div
      style={{
        ...css('flex:none;margin-top:18px;border-radius:13px;padding:13px 14px;display:flex;flex-direction:column;gap:6px'),
        background: warn ? 'var(--warning-soft)' : 'var(--accent-tint)',
        border: `1px solid ${warn ? 'var(--warning-border)' : 'var(--accent-border)'}`,
      }}
    >
      <div
        style={{
          ...css('font-size:12.5px;font-weight:700;letter-spacing:-.1px;text-wrap:pretty'),
          color: warn ? 'var(--warning-ink)' : 'var(--accent-ink)',
        }}
      >
        {title}
      </div>
      <div style={css('font-size:12.5px;line-height:1.6;color:var(--text-tertiary);text-wrap:pretty')}>{children}</div>
    </div>
  );
}

/** Emphasis inside prose, at the body colour rather than the heading colour. */
export function B({ children }: { children: ReactNode }) {
  return <strong style={css('font-weight:700;color:var(--text-secondary)')}>{children}</strong>;
}
