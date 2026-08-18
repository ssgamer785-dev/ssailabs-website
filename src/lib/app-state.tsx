import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface Notif {
  id: string;
  when: 'today' | 'earlier';
  cat: 'Signals' | 'Chat' | 'Community';
  kind: 'signal' | 'chat' | 'like' | 'comment' | 'target' | 'session';
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

export const NOTIFS: Notif[] = [
  { id: 'n1', when: 'today', cat: 'Signals', kind: 'signal', title: 'New Gold Analysis posted', body: 'Buy Above 3365 · SL 3358 | TP 3380', time: '8:02 AM', unread: true },
  { id: 'n2', when: 'today', cat: 'Chat', kind: 'chat', title: 'Admin sent you a PDF', body: 'Gold_Analysis.pdf · 2.4 MB', time: '10:30 AM', unread: true },
  { id: 'n3', when: 'today', cat: 'Community', kind: 'like', title: 'Rahul and 12 others liked your post', body: '“Gold looks bullish today.”', time: '11:14 AM', unread: true },
  { id: 'n4', when: 'today', cat: 'Community', kind: 'comment', title: 'Aman commented on your post', body: 'Can someone explain ICT setup?', time: '12:40 PM', unread: false },
  { id: 'n5', when: 'earlier', cat: 'Signals', kind: 'target', title: 'Target hit on EUR/USD', body: 'TP 1.0925 reached · +42 pips', time: 'Yesterday', unread: false },
  { id: 'n6', when: 'earlier', cat: 'Community', kind: 'session', title: 'Live session starts in 30 min', body: 'Risk management masterclass', time: 'Yesterday', unread: false },
  { id: 'n7', when: 'earlier', cat: 'Chat', kind: 'chat', title: 'Vivek replied to your message', body: 'Okay', time: '2 days ago', unread: false },
];

interface AppState {
  userName: string;
  reveal: boolean;
  toggleReveal: () => void;
  readMap: Record<string, boolean>;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [reveal, setReveal] = useState(false);
  const [readMap, setReadMap] = useState<Record<string, boolean>>({});
  const userName = 'Rahul Trader';

  const value = useMemo<AppState>(() => ({
    userName,
    reveal,
    toggleReveal: () => setReveal(v => !v),
    readMap,
    markRead: (id: string) => setReadMap(p => ({ ...p, [id]: true })),
    markAllRead: () => setReadMap(() => {
      const read: Record<string, boolean> = {};
      NOTIFS.forEach(n => { read[n.id] = true; });
      return read;
    }),
  }), [reveal, readMap]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}

export function initials(name: string) {
  return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
