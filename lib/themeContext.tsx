'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type AppTheme = 'dark' | 'light' | 'sepia';

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('tnovel_app_theme') as AppTheme;
    if (saved === 'dark' || saved === 'light' || saved === 'sepia') {
      setThemeState(saved);
      applyThemeToDoc(saved);
    } else {
      applyThemeToDoc('light');
    }
  }, []);

  function applyThemeToDoc(t: AppTheme) {
    const root = document.documentElement;
    root.classList.remove('dark', 'light', 'sepia', 'theme-dark', 'theme-light', 'theme-sepia');
    root.classList.add(t);
    root.classList.add(`theme-${t}`);
  }

  function setTheme(newTheme: AppTheme) {
    setThemeState(newTheme);
    localStorage.setItem('tnovel_app_theme', newTheme);
    applyThemeToDoc(newTheme);
  }

  function toggleTheme() {
    const next: AppTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'sepia' : 'light';
    setTheme(next);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
