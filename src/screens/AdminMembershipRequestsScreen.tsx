import { useCallback, useEffect, useState } from 'react';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { PhoneShell } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { listMembershipRequests, setMembershipStatus, type MembershipRequest } from '../lib/activation';
import type { MembershipRequestStatus } from '../lib/database.types';

/**
 * Membership requests, for the admin.
 *
 * A worklist, not a control panel: nothing here grants access. Marking a
 * request approved records that the admin decided to approve it — the person
 * still gets in by redeeming a code the admin creates and sends them. Keeping
 * those two things separate is what stops a mis-tap on this screen from
 * letting someone into the app.
 */

const STATUSES: MembershipRequestStatus[] = ['pending', 'contacted', 'approved', 'rejected'];

const STATUS_STYLE: Record<MembershipRequestStatus, string> = {
  pending:   'background:var(--neutral-fill);color:var(--text-tertiary)',
  contacted: 'background:var(--accent-tint);color:var(--accent-ink)',
  approved:  'background:var(--success-soft);color:var(--success-ink)',
  rejected:  'background:var(--danger-soft);color:var(--danger-ink)',
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function Row({ request, onChange }: { request: MembershipRequest; onChange: (s: MembershipRequestStatus) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={css('padding:14px 0;border-bottom:1px solid var(--surface-divider)')}>
      <div onClick={() => setOpen(v => !v)} style={css('display:flex;align-items:center;gap:11px;cursor:pointer')}>
        <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:4px')}>
          <div style={css('font-size:14.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
            {request.name}
          </div>
          <div style={css('font-size:11.5px;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
            {when(request.created_at)} · {request.mobile}
          </div>
        </div>
        <div style={css(`flex:none;height:22px;padding:0 9px;border-radius:7px;display:flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;${STATUS_STYLE[request.status]}`)}>
          {request.status}
        </div>
      </div>

      {open && (
        <div style={css('margin-top:12px;padding:14px;border-radius:13px;background:var(--surface-inset);display:flex;flex-direction:column;gap:9px')}>
          {([
            ['Email', request.email],
            ['Mobile', request.mobile],
            ['Experience', request.trading_experience],
            ['Address', request.address],
          ] as const).map(([label, value]) => (
            <div key={label} style={css('display:flex;flex-direction:column;gap:2px')}>
              <div style={css('font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--text-faint)')}>
                {label.toUpperCase()}
              </div>
              <div style={css('font-size:13px;color:var(--text-secondary);line-height:1.5;word-break:break-word;white-space:pre-wrap')}>
                {value}
              </div>
            </div>
          ))}

          <div style={css('margin-top:6px;display:flex;flex-wrap:wrap;gap:7px')}>
            {STATUSES.map(s => {
              const active = s === request.status;
              return (
                <Hoverable
                  key={s}
                  onClick={() => !active && onChange(s)}
                  className="pressable"
                  style={{
                    ...css('height:32px;padding:0 13px;border-radius:9px;display:flex;align-items:center;' +
                           'font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;flex:none'),
                    ...css(active ? STATUS_STYLE[s] : 'background:transparent;color:var(--text-faint)'),
                    border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
                  }}
                  hoverStyle={css(active ? '' : 'border-color:var(--border-strong);background:var(--surface-hover)')}
                >
                  {s}
                </Hoverable>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminMembershipRequestsScreen() {
  const [requests, setRequests] = useState<MembershipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed read must not render as "No requests yet": telling an admin that
  // nobody has applied, when the query simply errored, is the one wrong answer
  // this screen can give.
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await listMembershipRequests(100);
    if (rows) { setRequests(rows); setLoadFailed(false); } else { setLoadFailed(true); }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const change = useCallback(async (id: string, status: MembershipRequestStatus) => {
    // Optimistic: the only failure mode is the database refusing a non-admin,
    // and a non-admin cannot reach this screen. Reconciled by refresh() below.
    setRequests(rs => rs.map(r => (r.id === id ? { ...r, status } : r)));
    if (!await setMembershipStatus(id, status)) void refresh();
  }, [refresh]);

  const pending = requests.filter(r => r.status === 'pending').length;

  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:10px')}>
        <AppBackButton fallback="/admin/activation-codes" />
        <div style={css('flex:1;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap')}>Membership Requests</div>
        {pending > 0 && (
          <div style={css('flex:none;min-width:22px;height:22px;padding:0 7px;border-radius:999px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--on-accent)')}>
            {pending}
          </div>
        )}
      </div>

      <div className="nav-space" style={css('flex:1;min-height:0;overflow-y:auto;padding:0 20px;display:flex;flex-direction:column;overscroll-behavior:contain')}>
        {loading ? (
          <div style={css('margin-top:22px;font-size:12.5px;color:var(--text-faint)')}>Loading…</div>
        ) : loadFailed ? (
          <div role="alert" style={css('margin-top:16px;padding:14px;border-radius:13px;background:var(--danger-soft);display:flex;flex-direction:column;gap:10px;align-items:flex-start')}>
            <div style={css('font-size:12.5px;color:var(--danger-ink);line-height:1.5')}>
              Couldn&rsquo;t load membership requests. This is a loading problem,
              not an empty inbox &mdash; don&rsquo;t read it as &ldquo;nobody applied&rdquo;.
            </div>
            <Hoverable
              onClick={() => { setLoading(true); void refresh(); }}
              className="pressable"
              style={css('height:34px;padding:0 14px;border-radius:9px;border:1px solid var(--danger-border);display:flex;align-items:center;font-size:12px;font-weight:700;color:var(--danger-ink);cursor:pointer')}
              hoverStyle={css('background:var(--danger-soft)')}
            >
              Try again
            </Hoverable>
          </div>
        ) : requests.length === 0 ? (
          <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 24px;text-align:center')}>
            <div style={css('width:62px;height:62px;border-radius:20px;background:var(--accent-tint);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;flex:none')}>
              <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6.4h16v11.2H4z" /><path d="m4 7 8 5.6L20 7" />
              </svg>
            </div>
            <div style={css('margin-top:18px;font-size:16px;font-weight:700;letter-spacing:-.3px')}>No requests yet</div>
            <div style={css('margin-top:8px;font-size:12.5px;color:var(--text-muted);line-height:1.5')}>
              Requests from &ldquo;Become a Member&rdquo; will appear here.
            </div>
          </div>
        ) : (
          <div style={css('padding-bottom:26px')}>
            <div style={css('padding:14px 0 4px;font-size:11px;font-weight:700;letter-spacing:.12em;color:var(--text-faint)')}>
              {requests.length} TOTAL
            </div>
            {requests.map(r => (
              <Row key={r.id} request={r} onChange={s => void change(r.id, s)} />
            ))}
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
