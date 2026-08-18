import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { useAppState } from '../lib/app-state';
import { StatusBar } from '../components/StatusBar';
import { PhoneShell } from '../components/PhoneShell';

function LinkRow({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <Hoverable onClick={onClick} style={css('height:64px;padding:0 22px;display:flex;align-items:center;gap:14px;cursor:pointer')} hoverStyle={css('background:#FAFBFD')}>
      <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
        <div style={css('font-size:14px;font-weight:600;white-space:nowrap')}>{label}</div>
        <div style={css('font-size:11.5px;color:#94A3B8')}>{sub}</div>
      </div>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C2CAD6" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none')}><path d="M9 6l6 6-6 6" /></svg>
    </Hoverable>
  );
}

export function NameVisibilityScreen() {
  const navigate = useNavigate();
  const { userName, reveal, toggleReveal } = useAppState();

  return (
    <PhoneShell>
      <StatusBar />
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <svg onClick={() => navigate(-1)} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer;flex:none')}><path d="M14.5 5.5l-7 6.5 7 6.5" /></svg>
        <div style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px;padding-right:22px;white-space:nowrap')}>Name Visibility</div>
      </div>

      <div style={css('flex:none;margin:8px 20px 0;border:1px solid #EAEEF4;border-radius:12px;padding:13px 14px;display:flex;align-items:center;gap:12px;background:#fff')}>
        <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
          <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>Post with my real name</div>
          <div style={css('font-size:11.5px;color:#64748B;line-height:1.4')}>Members will see <strong style={css('color:#334155;font-weight:700')}>{reveal ? userName : 'Unknown User'}</strong> · admins always see your real name</div>
        </div>
        <div onClick={toggleReveal} style={{ width: 44, height: 26, borderRadius: 999, flex: 'none', cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center', justifyContent: reveal ? 'flex-end' : 'flex-start', background: reveal ? '#0B5FEF' : '#D5DBE5', transition: 'background .18s ease' }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(15,23,42,.28)' }} />
        </div>
      </div>

      <div style={css('flex:none;padding:22px 22px 9px;font-size:11px;font-weight:700;color:#94A3B8;letter-spacing:.07em;white-space:nowrap')}>REFERENCE — HOW OTHERS SEE THIS</div>
      <div style={css('flex:none;height:1px;background:#F1F4F9;margin:0 22px')} />
      <LinkRow label="Students Community — Admin view" sub="Real names always visible to admins" onClick={() => navigate('/community/admin-view')} />
      <div style={css('height:1px;background:#F1F4F9;margin:0 22px')} />
      <LinkRow label="Students Community — Member view" sub="What other students see (Unknown User)" onClick={() => navigate('/community/member-view')} />
      <div style={css('height:1px;background:#F1F4F9;margin:0 22px')} />
      <LinkRow label="Admin Inbox" sub="Direct messages, with real names shown" onClick={() => navigate('/admin-inbox')} />
      <div style={css('height:1px;background:#F1F4F9;margin:0 22px')} />

      <div style={css('flex:1')} />
    </PhoneShell>
  );
}
