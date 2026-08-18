import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { useAppState, NOTIFS, type Notif } from '../lib/app-state';
import { StatusBar } from '../components/StatusBar';
import { PhoneShell } from '../components/PhoneShell';

const NCATS = ['All', 'Community', 'Chat'] as const;

const ICONS: Record<Notif['kind'], [string, string, string]> = {
  signal: ['#EDF3FE', '#0B5FEF', 'M4.2 16.8 9 11.4l3.4 3.2 2.7-2.6 4.7 4.6M14.6 5.2h5v5'],
  target: ['#E9F8EF', '#16A34A', 'M12 3.6v16.8M12 3.6l4 4M12 3.6l-4 4M5 20.4h14'],
  like: ['#FEF1F1', '#EF4444', 'M12 20.4S4.3 15.2 4.3 10a4.3 4.3 0 0 1 7.7-2.6A4.3 4.3 0 0 1 19.7 10c0 5.2-7.7 10.4-7.7 10.4z'],
  comment: ['#F1F0FD', '#6B5DD3', 'M20.4 11.8c0 3.8-3.8 6.9-8.4 6.9-1 0-2-.1-2.9-.4L4.4 20.2l1.5-3.5c-1.6-1.3-2.5-3-2.5-4.9 0-3.8 3.8-6.9 8.4-6.9s8.6 3.1 8.6 6.9z'],
  chat: ['#EDF3FE', '#0B5FEF', 'M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z'],
  session: ['#FFF6E6', '#B98F3C', 'M12 7.4v5l3.4 2M12 3.9a8.1 8.1 0 1 1 0 16.2 8.1 8.1 0 0 1 0-16.2z'],
};

function NotifIcon({ kind }: { kind: Notif['kind'] }) {
  const [bg, stroke, d] = ICONS[kind];
  return (
    <div style={{ width: 42, height: 42, borderRadius: 13, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </div>
  );
}

export function NotificationsScreen() {
  const navigate = useNavigate();
  const { readMap, markRead, markAllRead } = useAppState();
  const [notifCat, setNotifCat] = useState<typeof NCATS[number]>('All');

  const isUnread = (n: Notif) => (readMap[n.id] ? false : n.unread);

  function Rows({ when }: { when: 'today' | 'earlier' }) {
    const list = NOTIFS.filter(n => n.when === when && (notifCat === 'All' || n.cat === notifCat));
    if (!list.length) return <div style={css('padding:10px 20px;font-size:13px;color:#94A3B8')}>Nothing here yet.</div>;
    return (
      <>
        {list.map(n => {
          const unread = isUnread(n);
          return (
            <div key={n.id} onClick={() => markRead(n.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 20px', cursor: 'pointer', background: unread ? '#F7FAFF' : 'transparent', borderLeft: unread ? '3px solid #0B5FEF' : '3px solid transparent' }}>
              <NotifIcon kind={n.kind} />
              <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
                <div style={{ fontSize: 13.5, fontWeight: unread ? 700 : 600, letterSpacing: '-.2px', lineHeight: 1.35 }}>{n.title}</div>
                <div style={css('font-size:12.5px;color:#64748B;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{n.body}</div>
              </div>
              <div style={css('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:7px')}>
                <div style={{ fontSize: 11, color: unread ? '#0B5FEF' : '#94A3B8', fontWeight: unread ? 600 : 400, whiteSpace: 'nowrap' }}>{n.time}</div>
                {unread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0B5FEF' }} />}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <PhoneShell>
      <StatusBar />
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <svg onClick={() => navigate(-1)} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer;flex:none')}><path d="M14.5 5.5l-7 6.5 7 6.5" /></svg>
        <div style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap')}>Notifications</div>
        <div onClick={markAllRead} style={css('font-size:12.5px;font-weight:600;color:#0B5FEF;cursor:pointer;flex:none;white-space:nowrap')}>Mark all read</div>
      </div>
      <div style={css('flex:none;padding:4px 20px 0;display:flex;gap:9px;overflow:hidden')}>
        {NCATS.map(c => {
          const on = notifCat === c;
          const count = c === 'All' ? NOTIFS.filter(isUnread).length : NOTIFS.filter(n => n.cat === c && isUnread(n)).length;
          return (
            <div key={c} onClick={() => setNotifCat(c)} style={{ height: 34, padding: '0 14px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap', cursor: 'pointer', flex: 'none', background: on ? '#0B5FEF' : '#F2F4F9', color: on ? '#FFFFFF' : '#475569', boxShadow: on ? '0 4px 12px rgba(11,95,239,.26)' : 'none' }}>
              {c}
              {count > 0 && <div style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, lineHeight: 1, background: on ? 'rgba(255,255,255,.24)' : '#DCE9FF', color: on ? '#FFFFFF' : '#0B5FEF' }}>{count}</div>}
            </div>
          );
        })}
      </div>
      <div style={css('flex:1;min-height:0;padding:16px 0 0;display:flex;flex-direction:column;overflow-y:auto')}>
        <div style={css('flex:none;padding:0 20px 9px;font-size:11px;font-weight:700;color:#94A3B8;letter-spacing:.07em;white-space:nowrap')}>TODAY</div>
        <Rows when="today" />
        <div style={css('flex:none;padding:16px 20px 9px;font-size:11px;font-weight:700;color:#94A3B8;letter-spacing:.07em;white-space:nowrap')}>EARLIER</div>
        <Rows when="earlier" />
        <div style={css('height:16px;flex:none')} />
      </div>
    </PhoneShell>
  );
}
