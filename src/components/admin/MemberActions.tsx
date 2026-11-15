import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '../../lib/css';
import { Avatar } from '../ui/Avatar';
import { DELETE_CONFIRMATION, MemberDeleteError, deleteMember } from '../../lib/admin/members';

export interface ManagedMember {
  id: string;
  name: string;
  avatarKey: string | null;
}

type Step = 'menu' | 'confirm' | 'type';

const overlay = { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, background: 'rgba(7, 15, 31, .52)', backdropFilter: 'blur(4px)' } as const;
const panel = { width: '100%', maxWidth: 380, padding: 22, border: '1px solid var(--border)', borderRadius: 20, background: 'var(--surface)', boxShadow: '0 20px 60px rgba(0,0,0,.24)', display: 'flex', flexDirection: 'column', gap: 14 } as const;
const secondaryBtn = css('min-height:42px;padding:0 15px;border:1px solid var(--border);border-radius:11px;background:var(--surface-secondary);color:var(--text-primary);font-size:13px;font-weight:600;cursor:pointer');
const dangerBtn = css('min-height:42px;padding:0 15px;border:0;border-radius:11px;background:var(--danger-solid);color:white;font-size:13px;font-weight:650;cursor:pointer');

/**
 * The admin's controls for one member: a "⋯" button that opens them, and the
 * two-step Delete member flow (what happens, then type DELETE). Everything is
 * enforced by the server and the database; this only asks.
 */
export function MemberActions({ member, onDeleted, size = 34 }: {
  member: ManagedMember;
  onDeleted: (member: ManagedMember) => void;
  size?: number;
}) {
  const [step, setStep] = useState<Step | null>(null);
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const typeInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (step === 'type') typeInput.current?.focus(); }, [step]);

  const close = () => {
    if (working) return;
    setStep(null); setTyped(''); setProblem(null);
  };

  async function confirmDelete() {
    if (working || typed !== DELETE_CONFIRMATION) return;
    setWorking(true);
    setProblem(null);
    try {
      await deleteMember(member.id, typed);
      setStep(null); setTyped('');
      onDeleted(member);
    } catch (error) {
      setProblem(error instanceof MemberDeleteError || error instanceof Error ? error.message : 'The member could not be deleted. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <button type="button" aria-label={`Manage ${member.name}`} aria-haspopup="dialog" title="Manage member"
        onClick={event => { event.stopPropagation(); setStep('menu'); }}
        className="pressable row-focus"
        style={{ ...css('flex:none;border-radius:50%;border:0;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);font-size:19px;line-height:1'), width: size, height: size }}>
        ⋯
      </button>

      {/* On the page itself, not inside the row or header that holds the button: a header clips (and a
          transformed ancestor re-anchors) a fixed overlay, which made the dialog unusable from a chat. */}
      {step && createPortal(
        <div onMouseDown={event => { if (event.target === event.currentTarget) close(); }} onClick={event => event.stopPropagation()} style={overlay}>
          {step === 'menu' && (
            <section role="dialog" aria-modal="true" aria-labelledby="member-actions-title" style={panel}>
              <div style={css('display:flex;align-items:center;gap:12px')}>
                <Avatar name={member.name} avatarKey={member.avatarKey} size={44} />
                <div style={css('flex:1;min-width:0')}>
                  <div id="member-actions-title" style={css('font-size:16px;font-weight:700;letter-spacing:-.25px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{member.name}</div>
                  <div style={css('font-size:12px;color:var(--text-muted)')}>Member</div>
                </div>
              </div>
              <button type="button" onClick={() => setStep('confirm')}
                style={css('min-height:46px;border-radius:12px;border:1px solid var(--danger-border);background:var(--danger-soft);color:var(--danger-ink);font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg>
                Delete member…
              </button>
              <button type="button" autoFocus onClick={close} style={secondaryBtn}>Cancel</button>
            </section>
          )}

          {step === 'confirm' && (
            <section role="alertdialog" aria-modal="true" aria-labelledby="delete-member-title" aria-describedby="delete-member-description" style={panel}>
              <div style={css('display:flex;align-items:center;gap:12px')}>
                <Avatar name={member.name} avatarKey={member.avatarKey} size={40} />
                <div id="delete-member-title" style={css('flex:1;min-width:0;font-size:16px;font-weight:700;letter-spacing:-.25px;line-height:1.3')}>Delete {member.name}?</div>
              </div>
              <div id="delete-member-description" style={css('display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--text-muted);line-height:1.5')}>
                <div role="note" style={css('padding:9px 11px;border-radius:10px;background:var(--danger-soft);color:var(--danger-ink);font-weight:700')}>
                  This is permanent and cannot be undone.
                </div>
                <ul style={css('margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px')}>
                  <li>They are signed out on every device and can never sign in again.</li>
                  <li>Their name, phone number and picture are removed, and their notifications and devices are deleted.</li>
                  <li>Their posts, comments, likes and poll votes stay, shown as &ldquo;Deleted member&rdquo;, so other members&rsquo; comments and poll results do not change.</li>
                  <li>Your chat with them is kept for your records.</li>
                </ul>
              </div>
              <div style={css('display:flex;justify-content:flex-end;gap:10px')}>
                <button type="button" autoFocus onClick={close} style={secondaryBtn}>Cancel</button>
                <button type="button" onClick={() => setStep('type')} style={dangerBtn}>Continue</button>
              </div>
            </section>
          )}

          {step === 'type' && (
            <section role="alertdialog" aria-modal="true" aria-labelledby="delete-member-type-title" style={panel}>
              <div id="delete-member-type-title" style={css('font-size:16px;font-weight:700;letter-spacing:-.25px;line-height:1.3')}>
                Type {DELETE_CONFIRMATION} to delete {member.name}
              </div>
              <input ref={typeInput} value={typed} onChange={event => setTyped(event.target.value)} disabled={working}
                aria-label={`Type ${DELETE_CONFIRMATION} to confirm`} autoCapitalize="characters" autoComplete="off" spellCheck={false}
                placeholder={DELETE_CONFIRMATION}
                onKeyDown={event => { if (event.key === 'Enter') void confirmDelete(); }}
                style={css('height:44px;border-radius:11px;border:1px solid var(--border-4);background:var(--surface-secondary);padding:0 13px;font-size:15px;letter-spacing:.08em')} />
              {problem && <div role="alert" style={css('font-size:12px;color:var(--danger-ink);line-height:1.45')}>{problem}</div>}
              <div style={css('display:flex;justify-content:flex-end;gap:10px')}>
                <button type="button" disabled={working} onClick={close} style={secondaryBtn}>Cancel</button>
                <button type="button" disabled={working || typed !== DELETE_CONFIRMATION} onClick={() => void confirmDelete()}
                  style={{ ...dangerBtn, opacity: working || typed !== DELETE_CONFIRMATION ? 0.5 : 1 }}>
                  {working ? 'Deleting…' : problem ? 'Try again' : 'Delete permanently'}
                </button>
              </div>
            </section>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
