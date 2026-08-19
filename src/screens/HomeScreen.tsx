import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { useAppState, initials } from '../lib/app-state';
import { useUnreadNotificationCount } from '../lib/notifications/useNotifications';
import { StatusBar } from '../components/StatusBar';
import { BottomNav } from '../components/BottomNav';
import { PhoneShell } from '../components/PhoneShell';

const quickAction = css('width:63px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer');
const quickIconWrap = css('width:52px;height:52px;border-radius:16px;background:#F2F6FE;border:1px solid #E7EEFC;display:flex;align-items:center;justify-content:center');
const quickLabel = css('font-size:10.5px;font-weight:500;color:#526174;text-align:center;line-height:1.28');

export function HomeScreen() {
  const navigate = useNavigate();
  const { userName } = useAppState();
  const unread = useUnreadNotificationCount();
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <PhoneShell scrollRef={scrollRef}>
      <StatusBar />
      <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden')}>
        <div ref={scrollRef} style={css('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column')}>
        <div style={css('flex:none;padding:4px 20px 16px;display:flex;align-items:center;gap:14px')}>
          <div style={css('width:44px;height:44px;border-radius:14px;background:#FFFFFF;box-shadow:0 3px 12px rgba(15,23,42,.10);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={1.9} strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </div>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
            <div style={css('font-size:12px;color:#8794A8;white-space:nowrap')}>Good Morning 👋</div>
            <div style={css('font-size:18px;font-weight:800;letter-spacing:-.45px;white-space:nowrap')}>{userName}</div>
          </div>
          <div onClick={() => navigate('/notifications')} style={css('position:relative;width:44px;height:44px;border-radius:14px;background:#FFFFFF;box-shadow:0 3px 12px rgba(15,23,42,.10);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M18 16.4H6l1.4-2.3V11a4.6 4.6 0 0 1 9.2 0v3.1z" /><path d="M10.3 19.2a1.9 1.9 0 0 0 3.4 0" /></svg>
            {unread > 0 && (
              <div style={css('position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#EF4444;border:2px solid #FFFFFF;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#FFFFFF;line-height:1')}>{unread}</div>
            )}
          </div>
          <div onClick={() => navigate('/profile')} style={css('width:44px;height:44px;border-radius:50%;background:#DCE7F7;color:#29527F;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex:none;box-shadow:0 2px 8px rgba(15,23,42,.10);cursor:pointer')}>{initials(userName)}</div>
        </div>

        <div style={css('flex:none;margin:0 20px;border-radius:20px;background:linear-gradient(150deg,#1C6EF6 0%,#0A4FDD 100%);box-shadow:0 14px 28px rgba(11,95,239,.28);padding:16px 18px 12px;color:#FFFFFF')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between')}>
            <div style={css('font-size:14.5px;font-weight:600;letter-spacing:-.2px;white-space:nowrap')}>Market Overview</div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9.5l6 6 6-6" /></svg>
          </div>
          <div style={css('margin-top:11px;font-size:11.5px;color:rgba(255,255,255,.72);white-space:nowrap')}>Market Sentiment</div>
          <div style={css('margin-top:2px;display:flex;align-items:center;justify-content:space-between')}>
            <div style={css('font-size:31px;font-weight:800;letter-spacing:-1px;line-height:1.15;white-space:nowrap')}>Bullish</div>
            <div style={css('height:26px;padding:0 10px;border-radius:9px;background:#22C55E;display:flex;align-items:center;font-size:11.5px;font-weight:700;color:#FFFFFF')}>+1.42%</div>
          </div>
          <svg width="100%" height="62" viewBox="0 0 322 48" preserveAspectRatio="none" fill="none" style={css('display:block;margin-top:6px')}>
            <polyline points="0,34 7,28 14,36 21,24 28,32 35,20 42,30 49,18 56,26 63,16 70,24 77,30 84,22 91,34 98,26 105,38 112,28 119,40 126,30 133,42 140,32 147,44 154,34 161,42 168,30 175,38 182,26 189,34 196,24 203,32 210,20 217,30 224,18 231,28 238,16 245,26 252,14 259,24 266,12 273,22 280,10 287,20 294,8 301,18 308,6 315,14 322,4" stroke="#FFFFFF" strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        <div style={css('flex:none;padding:20px 18px 0;display:flex;justify-content:space-between')}>
          <div style={quickAction} onClick={() => navigate('/analysis')}>
            <div style={quickIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.7} strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3.4" /><circle cx="9" cy="10" r="1.7" /><path d="M4.6 17.4l4.5-4.3 3.3 3.1 2.6-2.4 4.4 4" /></svg>
            </div>
            <div style={quickLabel}>Official<br /><br />Update</div>
          </div>
          <div style={quickAction} onClick={() => navigate('/community')}>
            <div style={quickIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8.2" r="3.1" /><path d="M3.4 19.6c0-3.1 2.5-5.5 5.6-5.5s5.6 2.4 5.6 5.5" /><path d="M16.3 5.8a3 3 0 0 1 0 5.9" /><path d="M16.8 14.4c2.3.5 4 2.5 4 5.2" /></svg>
            </div>
            <div style={quickLabel}>Community</div>
          </div>
          <div style={quickAction} onClick={() => navigate('/calculator')}>
            <div style={quickIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.7} strokeLinejoin="round"><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.4" /><path d="M4.4 10h15.2M10 4.4v15.2" /></svg>
            </div>
            <div style={quickLabel}>Calculator</div>
          </div>
          <div style={quickAction} onClick={() => navigate('/news')}>
            <div style={quickIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M6.6 3.6h6.3L18 8.5v11.9H6.6z" /><path d="M12.8 3.7v4.8H17.9" /><path d="M9.4 12.6h5.2M9.4 16h3.6" /></svg>
            </div>
            <div style={quickLabel}>News</div>
          </div>
          <div style={quickAction} onClick={() => navigate('/chat')}>
            <div style={quickIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M20.2 12.2c0 3.7-3.7 6.8-8.2 6.8-.9 0-1.8-.1-2.6-.4l-4.6 1.8 1.4-3.4c-1.5-1.3-2.4-3-2.4-4.8 0-3.7 3.7-6.8 8.2-6.8s8.2 3.1 8.2 6.8z" /><path d="M9.1 12.2h.01M12 12.2h.01M14.9 12.2h.01" /></svg>
            </div>
            <div style={quickLabel}>Chat</div>
          </div>
        </div>

        <div style={css('flex:none;padding:22px 20px 11px;font-size:15px;font-weight:700;letter-spacing:-.3px')}>Latest Official Update</div>
        <div onClick={() => navigate('/analysis')} style={css('flex:none;margin:0 20px;background:#FFFFFF;border:1px solid #EDF0F6;border-radius:16px;box-shadow:0 3px 14px rgba(15,23,42,.05);padding:14px 15px 12px;position:relative;overflow:hidden;cursor:pointer')}>
          <svg width="168" height="86" viewBox="0 0 168 86" preserveAspectRatio="none" style={css('position:absolute;right:0;bottom:0;opacity:.85')}>
            <path d="M0,80 L16,74 L32,70 L48,60 L64,63 L80,50 L96,44 L112,32 L128,27 L144,15 L168,6 L168,86 L0,86 Z" fill="rgba(11,95,239,.09)" />
            <path d="M0,80 L16,74 L32,70 L48,60 L64,63 L80,50 L96,44 L112,32 L128,27 L144,15 L168,6" fill="none" stroke="rgba(11,95,239,.32)" strokeWidth={1.3} />
          </svg>
          <div style={css('position:absolute;top:14px;right:15px;width:36px;height:36px;border-radius:12px;background:#EDF3FE;display:flex;align-items:center;justify-content:center')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 5.2c0-1 .8-1.8 1.8-1.8h1.9c.8 0 1.5.5 1.7 1.3l.7 2.5c.2.7-.1 1.5-.7 1.9l-1.2.8a11 11 0 0 0 4.4 4.4l.8-1.2c.4-.6 1.2-.9 1.9-.7l2.5.7c.8.2 1.3.9 1.3 1.7v1.9c0 1-.8 1.8-1.8 1.8C10.6 20.3 4.5 14.2 4.5 5.2z" /></svg>
          </div>
          <div style={css('position:relative;width:24px;height:3px;border-radius:2px;background:#D9A63F')} />
          <div style={css('position:relative;margin-top:9px;font-size:14.5px;font-weight:700;letter-spacing:-.25px')}>Gold Analysis</div>
          <div style={css('position:relative;margin-top:5px;font-size:12.5px;color:#64748B;line-height:1.55')}>Buy Above 3365</div>
          <div style={css('position:relative;font-size:12.5px;color:#64748B;line-height:1.55')}>SL 3358 | TP 3380</div>
          <div style={css('position:relative;margin-top:13px;display:flex;align-items:center;gap:9px')}>
            <div style={css('width:31px;height:31px;border-radius:9px;background:#FEF1F1;display:flex;align-items:center;justify-content:center;cursor:pointer')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.8} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg>
            </div>
            <div style={css('width:31px;height:31px;border-radius:9px;background:#EDF3FE;display:flex;align-items:center;justify-content:center;cursor:pointer')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3.4" /><circle cx="9" cy="10" r="1.7" /><path d="M4.6 17.4l4.5-4.3 3.3 3.1 2.6-2.4 4.4 4" /></svg>
            </div>
            <div style={css('width:38px;height:31px;border-radius:9px;background:#0F172A;display:flex;align-items:center;justify-content:center;cursor:pointer')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M8.5 5.5l10 6.5-10 6.5z" /></svg>
            </div>
            <div style={css('flex:1')} />
            <div style={css('font-size:11px;color:#94A3B8;white-space:nowrap')}>8:00 AM</div>
          </div>
        </div>

        <div style={css('flex:none;padding:20px 20px 12px;font-size:15px;font-weight:700;letter-spacing:-.3px')}>Recent Posts</div>
        <div onClick={() => navigate('/community')} style={css('flex:none;margin:0 20px;display:flex;align-items:center;gap:11px;cursor:pointer')}>
          <div style={css('width:38px;height:38px;border-radius:50%;background:#E4E9F7;color:#3C5A8A;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex:none')}>MO</div>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
            <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px')}>Market Outlook</div>
            <div style={css('font-size:11.5px;color:#94A3B8')}>Nifty likely to open positive</div>
          </div>
          <div style={css('font-size:11px;color:#94A3B8;flex:none;white-space:nowrap')}>Yesterday</div>
        </div>
        <div onClick={() => navigate('/analysis')} style={css('flex:none;margin:16px 20px 0;padding-top:15px;border-top:1px solid #F1F4F9;display:flex;align-items:center;gap:11px;cursor:pointer')}>
          <div style={css('width:38px;height:38px;border-radius:50%;background:#E7E3F7;color:#55488C;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex:none')}>GA</div>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
            <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px')}>Gold Analysis</div>
            <div style={css('font-size:11.5px;color:#94A3B8')}>Buy above 3365, SL 3358</div>
          </div>
          <div style={css('font-size:11px;color:#94A3B8;flex:none;white-space:nowrap')}>Yesterday</div>
        </div>
        <div style={css('height:20px;flex:none')} />
        </div>
      </div>
      <BottomNav active="home" />
    </PhoneShell>
  );
}
