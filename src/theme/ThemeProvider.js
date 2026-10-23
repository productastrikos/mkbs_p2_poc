import React, { createContext, useContext, useState } from 'react';

/* Theme switching per ASTRIKOS-UI-THEME §5.7: data-theme lives on <body>,
   the preference persists under 'astrikos-theme', and dark is the default.
   public/index.html runs the same logic inline before first paint. */
const KEY = 'astrikos-theme';
const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

export function applyTheme(mode /* 'dark' | 'light' */) {
  document.body.setAttribute('data-theme', mode);
  try { localStorage.setItem(KEY, mode); } catch (e) { /* storage unavailable */ }
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  const mode = saved === 'light' || saved === 'dark' ? saved : prefersLight ? 'light' : 'dark';
  applyTheme(mode);
  return mode;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initTheme);

  // The attribute changes before React re-renders, so charts and map lines
  // that read CSS variables during render pick up the new theme.
  const toggleTheme = () => {
    const next = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setTheme(next);
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
