import React, { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'app_theme';
const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

function initialTheme() {
  let theme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch (e) { /* storage unavailable */ }
  // Applied before the first render so charts read the right colours.
  document.documentElement.dataset.theme = theme;
  return theme;
}

// Sets data-theme on <html>; the variables in theme.css switch on that attribute.
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* storage unavailable */ }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
