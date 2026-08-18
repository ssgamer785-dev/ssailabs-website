import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { StatusBar } from '../components/StatusBar';
import { BottomNav } from '../components/BottomNav';
import { PhoneShell } from '../components/PhoneShell';
import logo from '../assets/traders-planet-logo.jpg';

export function ChatListScreen() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  return (
    <PhoneShell>
      <StatusBar />
      <div style={css('flex:none;height:52px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Chat</div>
      <div style={css('flex:none;margin:4px 20px 8px;height:44px;border-radius:12px;background:#F2F4F9;display:flex;align-items:center;padding:0 14px;gap:10px')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" style={css('flex:none')}><circle cx="10.8" cy="10.8" r="6.4" /><path d="M15.6 15.6l4.2 4.2" /></svg>
        <input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} style={css('flex:1;font-size:14px;height:100%')} />
      </div>
      <div style={css('flex:1;min-height:0;padding:6px 20px 0;display:flex;flex-direction:column;overflow-y:auto')}>
        <div onClick={() => navigate('/chat/admin')} style={css('display:flex;align-items:center;gap:12px;padding:11px 0;cursor:pointer')}>
          <div style={css('position:relative;flex:none')}>
            <div style={css('width:46px;height:46px;border-radius:50%;background:#0F1733;display:flex;align-items:center;justify-content:center;overflow:hidden')}>
              <img src={logo} alt="The Traders Planet" style={css('width:40px;height:40px;object-fit:contain')} />
            </div>
            <div style={css('position:absolute;right:0;bottom:0;width:12px;height:12px;border-radius:50%;background:#22C55E;border:2.4px solid #fff')} />
          </div>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
            <div style={css('display:flex;align-items:center;gap:5px')}>
              <div style={css('font-size:14.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>Admin</div>
              <svg width="14" height="14" viewBox="0 0 24 24" style={css('display:block;flex:none')}><circle cx="12" cy="12" r="9.5" fill="#0B5FEF" /><path d="M8.2 12.3l2.6 2.6 5.1-5.4" fill="none" stroke="#FFFFFF" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={css('font-size:11.5px;font-weight:600;color:#22C55E')}>Online</div>
            <div style={css('font-size:12.5px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>Sure, check the PDF.</div>
          </div>
          <div style={css('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:7px')}>
            <div style={css('font-size:11px;font-weight:600;color:#0B5FEF;white-space:nowrap')}>10:30 AM</div>
            <div style={css('min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#0B5FEF;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff')}>2</div>
          </div>
        </div>
        <div style={css('height:1px;background:#F1F4F9')} />
        <div style={css('display:flex;align-items:center;gap:12px;padding:13px 0;cursor:pointer')}>
          <div style={css('width:46px;height:46px;border-radius:50%;background:#EDF3FE;display:flex;align-items:center;justify-content:center;flex:none')}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.4a2.3 2.3 0 0 1 4.4.9c0 1.5-2.2 1.8-2.2 3.2" /><path d="M12 16.6h.01" /></svg>
          </div>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
            <div style={css('font-size:14.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>Help &amp; Support</div>
            <div style={css('font-size:12.5px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>Ask about courses, fees or access</div>
          </div>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C2CAD6" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none')}><path d="M9 6l6 6-6 6" /></svg>
        </div>
        <div style={css('height:1px;background:#F1F4F9')} />
        <div style={css('margin-top:20px;background:#F7F8FB;border-radius:14px;padding:16px 15px;display:flex;flex-direction:column;align-items:center;gap:8px')}>
          <div style={css('width:42px;height:42px;border-radius:13px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(15,23,42,.06)')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.4" width="14" height="9.6" rx="2.6" /><path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4" /></svg>
          </div>
          <div style={css('font-size:13px;font-weight:700;letter-spacing:-.2px;text-align:center')}>Direct member chat is off</div>
          <div style={css("font-size:11.5px;color:#64748B;line-height:1.5;text-align:center;text-wrap:pretty")}>Members cannot message each other. Post in the Students Community or write to the Admin instead.</div>
        </div>
        <div style={css('height:16px;flex:none')} />
      </div>
      <BottomNav active="chat" />
    </PhoneShell>
  );
}
