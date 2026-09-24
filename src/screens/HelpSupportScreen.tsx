import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { supportWhatsAppDisplay, supportWhatsAppUrl } from '../lib/support';
import { useAuth } from '../lib/auth-context';
import { B, DocumentScreen, P, Section } from '../components/ui/DocumentScreen';

/**
 * Support that uses what the app already has rather than standing up anything
 * new: the admin conversation is the real support channel and already exists at
 * /chat/admin, and WhatsApp is the same number the membership hand-off opens.
 *
 * The two routes are ordered by what actually gets answered. In-app chat is
 * first because it carries the member's identity, their thread history and
 * their attachments; WhatsApp is second, for someone who cannot get into the
 * app at all — which is exactly when an in-app support link is no use.
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
  const { isAdmin } = useAuth();
  // null when the number is not configured — the card is dropped rather than
  // rendered as a link that opens an empty chat with nobody.
  const whatsapp = supportWhatsAppUrl(
    'Hi — I need help with The Traders Planet app.',
  );

  return (
    <DocumentScreen
      title="Help & Support"
      intro={isAdmin ? 'Find answers below or open the member inbox.' : 'Stuck on something? Start with the answers below — if none of them fit, the admin team is one tap away.'}
    >
      <div style={css('flex:none;padding-top:16px;display:flex;flex-direction:column;gap:9px')}>
        <ActionCard
          primary
          onClick={() => navigate(isAdmin ? '/admin-inbox' : '/chat/admin')}
          title={isAdmin ? 'Open Member Inbox' : 'Message the admin team'}
          sub={isAdmin ? 'Continue conversations with members.' : 'The fastest route. Replies arrive in your chat.'}
          icon={
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.2 12.2c0 3.7-3.7 6.8-8.2 6.8-.9 0-1.8-.1-2.6-.4l-4.6 1.8 1.4-3.4c-1.5-1.3-2.4-3-2.4-4.8 0-3.7 3.7-6.8 8.2-6.8s8.2 3.1 8.2 6.8z" />
            </svg>
          }
        />
        {whatsapp && (
          <ActionCard
            href={whatsapp}
            title="WhatsApp support"
            sub={supportWhatsAppDisplay()}
            icon={
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12.04 2.2a9.7 9.7 0 0 0-8.3 14.72L2.2 21.8l5-1.5a9.7 9.7 0 1 0 4.84-18.1zm0 1.78a7.92 7.92 0 1 1-4.04 14.73l-.29-.17-2.96.89.9-2.88-.19-.3A7.92 7.92 0 0 1 12.04 3.98z" />
                <path d="M9.3 7.3c-.17-.4-.35-.4-.52-.41h-.44c-.15 0-.4.06-.6.29-.21.23-.8.77-.8 1.88s.82 2.18.93 2.33c.12.16 1.58 2.5 3.9 3.42 1.93.75 2.33.6 2.75.56.42-.04 1.35-.54 1.54-1.07.19-.53.19-.98.13-1.07-.05-.1-.2-.15-.43-.26-.23-.12-1.35-.66-1.56-.74-.2-.08-.36-.12-.51.11-.15.23-.58.74-.71.89-.13.15-.26.17-.49.06a6.3 6.3 0 0 1-1.84-1.13 6.9 6.9 0 0 1-1.27-1.58c-.13-.23-.01-.35.1-.46.1-.1.23-.27.34-.4.11-.14.15-.23.23-.39.08-.15.04-.29-.02-.4-.06-.12-.5-1.25-.7-1.7z" />
              </svg>
            }
          />
        )}
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
          chat, or send it on WhatsApp if you cannot get into the app.
        </P>
      </Section>
    </DocumentScreen>
  );
}
