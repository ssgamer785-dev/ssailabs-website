import { css } from '../lib/css';
import { StatusBar } from '../components/StatusBar';
import { BottomNav } from '../components/BottomNav';
import { PhoneShell } from '../components/PhoneShell';

function ThreadRow({ initial, bg, fg, name, sub, preview, time, unreadCount, sharedTag, mutedTime }: {
  initial: string; bg: string; fg: string; name: string; sub?: string; preview: string; time: string; unreadCount?: number; sharedTag?: boolean; mutedTime?: boolean;
}) {
  return (
    <div style={css('display:flex;align-items:center;gap:12px;padding:12px 0;cursor:pointer')}>
      <div style={{ width: 46, height: 46, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flex: 'none' }}>{initial}</div>
      <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
        <div style={css('display:flex;align-items:center;gap:6px')}>
          <div style={css('font-size:14.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>{name}</div>
          {sharedTag && <div style={css('height:17px;padding:0 6px;border-radius:5px;background:#E9F8EF;color:#16A34A;display:flex;align-items:center;font-size:9px;font-weight:700;letter-spacing:.05em;white-space:nowrap;flex:none')}>NAME SHARED</div>}
        </div>
        {sub && <div style={css('font-size:11px;color:#94A3B8;white-space:nowrap')}>{sub}</div>}
        <div style={css('font-size:12.5px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{preview}</div>
      </div>
      {unreadCount ? (
        <div style={css('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:7px')}>
          <div style={css('font-size:11px;font-weight:600;color:#0B5FEF;white-space:nowrap')}>{time}</div>
          <div style={css('min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#0B5FEF;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff')}>{unreadCount}</div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#94A3B8', flex: 'none', whiteSpace: 'nowrap', fontWeight: mutedTime ? 400 : undefined }}>{time}</div>
      )}
    </div>
  );
}

export function AdminInboxScreen() {
  return (
    <PhoneShell>
      <StatusBar />
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:10px')}>
        <div style={css('flex:1;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap')}>Inbox</div>
        <div style={css('height:24px;padding:0 9px;border-radius:7px;background:#0F172A;display:flex;align-items:center;gap:5px;flex:none')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinejoin="round"><path d="M12 3.8 5.6 6.2v5.3c0 4 2.6 7.4 6.4 8.7 3.8-1.3 6.4-4.7 6.4-8.7V6.2z" /></svg>
          <div style={css('font-size:10px;font-weight:700;color:#FFFFFF;letter-spacing:.05em;white-space:nowrap')}>ADMIN VIEW</div>
        </div>
      </div>
      <div style={css('flex:none;margin:2px 20px 10px;background:#FFF9EC;border:1px solid #F3E3BE;border-radius:12px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B98F3C" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none;margin-top:1px')}><circle cx="12" cy="12" r="8.5" /><path d="M12 8.2v.01M12 11v5" /></svg>
        <div style={css("flex:1;font-size:11.5px;color:#7A5D25;line-height:1.45;text-wrap:pretty")}>Real names are always visible to admins, even when a member appears as Unknown User to others.</div>
      </div>
      <div style={css('flex:1;min-height:0;padding:0 20px;display:flex;flex-direction:column;overflow-y:auto')}>
        <ThreadRow initial="RS" bg="#DCE7F7" fg="#29527F" name="Rahul Sharma" sub="Appears to others as Unknown User" preview="Sir, gold ka setup samjha dijiye" time="10:28 AM" unreadCount={3} />
        <div style={css('height:1px;background:#F1F4F9')} />
        <ThreadRow initial="AV" bg="#E7E3F7" fg="#55488C" name="Aman Verma" preview="Thanks for explaining!" time="Yesterday" sharedTag />
        <div style={css('height:1px;background:#F1F4F9')} />
        <ThreadRow initial="VK" bg="#DEF0E6" fg="#2F6B4A" name="Vivek Kumar" sub="Appears to others as Unknown User" preview="Okay" time="2 days ago" />
        <div style={css('height:1px;background:#F1F4F9')} />
        <ThreadRow initial="MP" bg="#F3E6EF" fg="#7A3F66" name="Mohit Patel" sub="Appears to others as Unknown User" preview="👍" time="2 days ago" />
        <div style={css('height:1px;background:#F1F4F9')} />
      </div>
      <BottomNav active="chat" />
    </PhoneShell>
  );
}
