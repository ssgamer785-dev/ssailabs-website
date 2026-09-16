import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { SUPPORT_EMAIL, supportMailto } from '../lib/support';
import { B, DocumentScreen, P, Section } from '../components/ui/DocumentScreen';

/**
 * Support that uses what the app already has rather than standing up anything
 * new: the admin conversation is the real support channel and already exists at
 * /chat/admin, and the owner address is the one server.ts already notifies.
 *
 * The answers below are about this app specifically — name visibility, the
 * media allowance, why member-to-member chat is off — because a FAQ that could
 * belong to any product is just more screen to scroll past.
 */

function ActionCard({ onClick, href, icon, title, sub, primary = false }: {
  onClick?: () => void;
  href?: string;
  icon: ReactNode;
  title: string;
  sub: string;
  primary?: boolean;
}) {
  const style = {
    ...css('flex:none;width:100%;min-height:64px;padding:13px 14px;display:flex;align-items:center;gap:13px;' +
           'border-radius:14px;cursor:pointer;text-align:left;text-decoration:none'),
    background: primary ? 'var(--accent)' : 'var(--surface-secondary)',
    border: primary ? '1px solid var(--accent)' : '1px solid var(--border-4)',
  };
  const inner = (
    <>
      <span
        aria-hidden="true"
        style={{
          ...css('width:38px;height:38px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center'),
          background: primary ? 'rgba(255,255,255,.18)' : 'var(--surface)',
          color: primary ? 'var(--on-accent)' : 'var(--accent-ink)',
        }}
      >
        {icon}
      </span>
      <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        <span style={{
          ...css('font-size:14px;font-weight:600;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'),
          color: primary ? 'var(--on-accent)' : 'var(--text-primary)',
        }}>{title}</span>
        <span style={{
          ...css('font-size:11.5px;line-height:1.45;text-wrap:pretty'),
          color: primary ? 'rgba(255,255,255,.82)' : 'var(--text-muted)',
        }}>{sub}</span>
      </span>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"
        stroke={primary ? 'rgba(255,255,255,.75)' : 'var(--text-dim)'} style={css('flex:none')}>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </>
  );

  return href
    ? <a href={href} className="pressable row-focus" style={style}>{inner}</a>
    : <button type="button" onClick={onClick} className="pressable row-focus" style={style}>{inner}</button>;
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={css('flex:none;border-bottom:1px solid var(--surface-divider)')}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="row-focus"
        style={css('width:100%;min-height:46px;padding:12px 0;display:flex;align-items:center;gap:12px;' +
                   'border:0;background:transparent;cursor:pointer;text-align:left')}
      >
        <span style={css('flex:1;font-size:13px;font-weight:600;letter-spacing:-.1px;color:var(--text-primary);line-height:1.45;text-wrap:pretty')}>
          {q}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth={2.2}
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          style={{ ...css('flex:none;transition:transform 200ms var(--ease-out)'), transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div style={css('padding:0 0 13px;font-size:12.5px;line-height:1.62;color:var(--text-tertiary);text-wrap:pretty')}>
          {children}
        </div>
      )}
    </div>
  );
}

export function HelpSupportScreen() {
  const navigate = useNavigate();

  return (
    <DocumentScreen
      title="Help & Support"
      intro="Stuck on something? Start with the answers below — if none of them fit, the admin team is one tap away."
    >
      <div style={css('flex:none;padding-top:16px;display:flex;flex-direction:column;gap:9px')}>
        <ActionCard
          primary
          onClick={() => navigate('/chat/admin')}
          title="Message the admin team"
          sub="The fastest route. Replies arrive in your chat."
          icon={
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.2 12.2c0 3.7-3.7 6.8-8.2 6.8-.9 0-1.8-.1-2.6-.4l-4.6 1.8 1.4-3.4c-1.5-1.3-2.4-3-2.4-4.8 0-3.7 3.7-6.8 8.2-6.8s8.2 3.1 8.2 6.8z" />
            </svg>
          }
        />
        <ActionCard
          href={supportMailto('The Traders Planet — support request')}
          title="Email support"
          sub={SUPPORT_EMAIL}
          icon={
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.6" />
              <path d="M3.8 7 12 12.6 20.2 7" />
            </svg>
          }
        />
      </div>

      <Section title="Common questions">
        <div style={css('display:flex;flex-direction:column;border-top:1px solid var(--surface-divider)')}>
          <Faq q="Who can see my real name when I post?">
            Other students see <B>Unknown User</B> unless you turn on name sharing. The admin team
            always sees your real name, on posts and in messages — that setting hides you from
            members, not from the people running the platform.
          </Faq>
          <Faq q="How do I change my name visibility?">
            Profile → Name Visibility, or flip the same switch on the Create Post screen before you
            publish. It applies from that point on.
          </Faq>
          <Faq q="Can I message another member directly?">
            No. Member-to-member chat is deliberately off. Post in the Students Community if you
            want the group's input, or message the admin team for anything private.
          </Faq>
          <Faq q="An older photo in my chat stopped loading. Why?">
            Each account has a storage allowance. When it is full, the oldest media in the
            conversation is removed so new messages can send. The message stays in the thread but
            the file is gone and cannot be restored — keep your own copy of anything important.
          </Faq>
          <Faq q="What can I attach to a post or a message?">
            Images, video, PDFs and voice notes. Very large files may be rejected, and video is
            stored with a poster frame so the chat stays quick to load.
          </Faq>
          <Faq q="How do I delete something I posted?">
            Press and hold the post or message — right-click on a desktop — and confirm. You can
            only delete your own. Deleting removes the media with it.
          </Faq>
          <Faq q="Where does Market News come from?">
            Nowhere yet — no live market feed is connected, which is why that screen says so instead
            of showing headlines. Analysis from the team appears under Official in Community.
          </Faq>
          <Faq q="How do I use the Risk Calculator?">
            Pick your instrument and account currency, enter your balance, your entry and stop-loss
            prices and the percentage you are willing to risk. It returns the position size that
            keeps the loss at that percentage if your stop is hit.
          </Faq>
        </div>
      </Section>

      <Section title="Jump to">
        <div style={css('display:flex;flex-wrap:wrap;gap:8px;padding-top:2px')}>
          {([
            ['Name Visibility', '/profile/name-visibility'],
            ['Students Community', '/community?tab=students'],
            ['Risk Calculator', '/calculator'],
            ['Notifications', '/notifications'],
          ] as [string, string][]).map(([label, route]) => (
            <button
              key={route}
              type="button"
              onClick={() => navigate(route)}
              className="pressable row-focus"
              style={css('min-height:36px;padding:0 13px;border-radius:999px;cursor:pointer;font-size:12.5px;font-weight:500;' +
                         'white-space:nowrap;background:var(--surface-secondary);border:1px solid var(--border-4);color:var(--text-secondary)')}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Before you write in">
        <P>
          Telling us what you were doing, what you expected and what happened instead gets you a
          useful answer first time. A screenshot helps — you can attach one straight to the admin
          chat.
        </P>
      </Section>
    </DocumentScreen>
  );
}
