import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';

export type NavTab = 'home' | 'community' | 'calculator' | 'news' | 'chat';

const ROUTES: Record<NavTab, string> = {
  home: '/home',
  community: '/community',
  calculator: '/calculator',
  news: '/news',
  chat: '/chat',
};

const ITEM_STYLE = css('flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer');
const LABEL_ACTIVE = css('font-size:10px;font-weight:600;color:#0B5FEF;letter-spacing:-.1px');
const LABEL_INACTIVE = css('font-size:10px;font-weight:500;color:#94A3B8;letter-spacing:-.1px');

function Item({ tab, active, label, activeIcon, inactiveIcon }: {
  tab: NavTab; active: boolean; label: string; activeIcon: ReactNode; inactiveIcon: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div style={ITEM_STYLE} onClick={() => navigate(ROUTES[tab])}>
      {active ? activeIcon : inactiveIcon}
      <div style={active ? LABEL_ACTIVE : LABEL_INACTIVE}>{label}</div>
    </div>
  );
}

export function BottomNav({ active }: { active: NavTab }) {
  return (
    <div style={css("flex:none;display:flex;align-items:flex-start;background:#FFFFFF;border-top:1px solid #EFF1F6;box-shadow:0 -4px 18px rgba(15,23,42,.035);padding:10px 6px 20px;font-family:-apple-system,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif")}>
      <Item
        tab="home" active={active === 'home'} label="Home"
        activeIcon={<svg width="23" height="23" viewBox="0 0 24 24" fill="#0B5FEF" style={css('display:block')}><path d="M4.2 10.4 12 4.3l7.8 6.1V19a1.6 1.6 0 0 1-1.6 1.6H5.8A1.6 1.6 0 0 1 4.2 19z" /></svg>}
        inactiveIcon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={css('display:block')}><path d="M4.2 10.4 12 4.3l7.8 6.1V19a1.6 1.6 0 0 1-1.6 1.6H5.8A1.6 1.6 0 0 1 4.2 19z" /></svg>}
      />
      <Item
        tab="community" active={active === 'community'} label="Community"
        activeIcon={<svg width="23" height="23" viewBox="0 0 24 24" fill="#0B5FEF" style={css('display:block')}><circle cx="9" cy="8.2" r="3.4" /><path d="M2.9 19.8c0-3.4 2.7-6.1 6.1-6.1s6.1 2.7 6.1 6.1z" /><circle cx="17.2" cy="8.9" r="2.5" /><path d="M16 13.8c2.9 0 5.1 2.5 5.1 5.4h-3.4c0-2-.5-3.9-1.7-5.4z" /></svg>}
        inactiveIcon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={css('display:block')}><circle cx="9" cy="8.2" r="3.1" /><path d="M3.4 19.6c0-3.1 2.5-5.5 5.6-5.5s5.6 2.4 5.6 5.5" /><path d="M16.3 5.8a3 3 0 0 1 0 5.9" /><path d="M16.8 14.4c2.3.5 4 2.5 4 5.2" /></svg>}
      />
      <Item
        tab="calculator" active={active === 'calculator'} label="Calculator"
        activeIcon={<svg width="23" height="23" viewBox="0 0 24 24" style={css('display:block')}><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.4" fill="#0B5FEF" /><path d="M4.4 10h15.2M10 4.4v15.2" stroke="#FFFFFF" strokeWidth="1.6" /></svg>}
        inactiveIcon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.7" strokeLinejoin="round" style={css('display:block')}><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.4" /><path d="M4.4 10h15.2M10 4.4v15.2" /></svg>}
      />
      <Item
        tab="news" active={active === 'news'} label="News"
        activeIcon={<svg width="23" height="23" viewBox="0 0 24 24" style={css('display:block')}><path d="M6.6 3.6h6.3L18 8.5v11.9H6.6z" fill="#0B5FEF" /><path d="M9.4 12.4h5.6M9.4 15.9h3.9" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" /></svg>}
        inactiveIcon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={css('display:block')}><path d="M6.6 3.6h6.3L18 8.5v11.9H6.6z" /><path d="M12.8 3.7v4.8H17.9" /><path d="M9.4 12.6h5.2M9.4 16h3.6" /></svg>}
      />
      <Item
        tab="chat" active={active === 'chat'} label="Chat"
        activeIcon={<svg width="23" height="23" viewBox="0 0 24 24" style={css('display:block')}><path d="M20.2 12.2c0 3.7-3.7 6.8-8.2 6.8-.9 0-1.8-.1-2.6-.4l-4.6 1.8 1.4-3.4c-1.5-1.3-2.4-3-2.4-4.8 0-3.7 3.7-6.8 8.2-6.8s8.2 3.1 8.2 6.8z" fill="#0B5FEF" /><path d="M8.4 12.2h7.2" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" /></svg>}
        inactiveIcon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={css('display:block')}><path d="M20.2 12.2c0 3.7-3.7 6.8-8.2 6.8-.9 0-1.8-.1-2.6-.4l-4.6 1.8 1.4-3.4c-1.5-1.3-2.4-3-2.4-4.8 0-3.7 3.7-6.8 8.2-6.8s8.2 3.1 8.2 6.8z" /><path d="M9.1 12.2h.01M12 12.2h.01M14.9 12.2h.01" /></svg>}
      />
    </div>
  );
}
