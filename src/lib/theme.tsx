import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

/** Shared with the boot script in index.html; changing it here changes nothing there. */
export const THEME_STORAGE_KEY = 'tp-theme';

/**
 * Light, always, until someone says otherwise.
 *
 * Deliberately not `prefers-color-scheme`: a trader who has their laptop in
 * dark mode has not asked this app for a dark trading screen, and the app
 * shipped light. The only thing that turns dark on is the control on Profile.
 */
export const DEFAULT_THEME: Theme = 'light';

/** How long the cross-fade in index.css runs; kept in step with it. */
const SWITCH_MS = 180;

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : DEFAULT_THEME;
  } catch {
    // Private mode, or storage disabled: the app still works, it just forgets.
    return DEFAULT_THEME;
  }
}

/**
 * Puts the theme on <html>, which is where the token blocks in index.css are
 * scoped. Light carries no attribute at all, so the default costs nothing and
 * a stale attribute can never strand someone in a theme they did not pick.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The boot script in index.html has already set the attribute by now, so this
  // reads the same value it used and React never disagrees with the DOM.
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(prev => {
      if (prev === next) return prev;

      // Recolour in place rather than cutting: the class is on <html> only for
      // the length of the fade, so nothing else in the app is ever transitioning
      // colour it did not ask to. Motion preferences are honoured by skipping
      // the fade entirely — the switch is instant, which is what "reduce" means
      // here, not "slower".
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      if (!reduce) {
        const root = document.documentElement;
        root.classList.add('theme-switching');
        window.setTimeout(() => root.classList.remove('theme-switching'), SWITCH_MS + 40);
      }

      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* nothing to do */ }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
