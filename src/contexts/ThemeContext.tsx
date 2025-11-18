'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'custom';

export interface CustomTheme {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  hoverColor: string;
  fontFamily: string;
}

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  customTheme: CustomTheme | null;
  setCustomTheme: (theme: CustomTheme) => void;
  applyCustomTheme: (theme: CustomTheme) => void;
}

const defaultCustomTheme: CustomTheme = {
  background: '#0f172a',
  foreground: '#f8fafc',
  card: '#1e293b',
  cardForeground: '#f8fafc',
  primary: '#38bdf8',
  primaryForeground: '#0f172a',
  secondary: '#334155',
  secondaryForeground: '#f8fafc',
  muted: '#334155',
  mutedForeground: '#cbd5e1',
  accent: '#334155',
  accentForeground: '#f8fafc',
  border: '#334155',
  hoverColor: '#0ea5e9',
  fontFamily: 'Inter, sans-serif',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light'); // Changed default to 'light'
  const [customTheme, setCustomThemeState] = useState<CustomTheme | null>(null);
  const [mounted, setMounted] = useState(false);

  const applyCustomTheme = (customTheme: CustomTheme) => {
    const root = document.documentElement;
    
    // Convert hex to HSL for Tailwind
    const hexToHSL = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return '0 0% 0%';
      
      const r = parseInt(result[1], 16) / 255;
      const g = parseInt(result[2], 16) / 255;
      const b = parseInt(result[3], 16) / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      
      h = Math.round(h * 360);
      s = Math.round(s * 100);
      l = Math.round(l * 100);
      
      return `${h} ${s}% ${l}%`;
    };

    root.style.setProperty('--background', hexToHSL(customTheme.background));
    root.style.setProperty('--foreground', hexToHSL(customTheme.foreground));
    root.style.setProperty('--card', hexToHSL(customTheme.card));
    root.style.setProperty('--card-foreground', hexToHSL(customTheme.cardForeground));
    root.style.setProperty('--primary', hexToHSL(customTheme.primary));
    root.style.setProperty('--primary-foreground', hexToHSL(customTheme.primaryForeground));
    root.style.setProperty('--secondary', hexToHSL(customTheme.secondary));
    root.style.setProperty('--secondary-foreground', hexToHSL(customTheme.secondaryForeground));
    root.style.setProperty('--muted', hexToHSL(customTheme.muted));
    root.style.setProperty('--muted-foreground', hexToHSL(customTheme.mutedForeground));
    root.style.setProperty('--accent', hexToHSL(customTheme.accent));
    root.style.setProperty('--accent-foreground', hexToHSL(customTheme.accentForeground));
    root.style.setProperty('--border', hexToHSL(customTheme.border));
    root.style.setProperty('--hover-color', customTheme.hoverColor);
    
    if (customTheme.fontFamily) {
      root.style.setProperty('font-family', customTheme.fontFamily);
    }
  };

  useEffect(() => {
    setMounted(true);
    // Read theme from localStorage
    const savedTheme = localStorage.getItem('app-theme') as Theme | null;
    const savedCustomTheme = localStorage.getItem('custom-theme');
    
    if (savedCustomTheme) {
      const parsed = JSON.parse(savedCustomTheme);
      setCustomThemeState(parsed);
    }
    
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'custom') {
      setThemeState(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
      document.documentElement.classList.toggle('light', savedTheme === 'light');
      document.documentElement.classList.toggle('custom', savedTheme === 'custom');
      
      if (savedTheme === 'custom' && savedCustomTheme) {
        applyCustomTheme(JSON.parse(savedCustomTheme));
      }
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Listen for theme changes from other tabs/apps
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'app-theme' && e.newValue) {
        const newTheme = e.newValue as Theme;
        setThemeState(newTheme);
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
        document.documentElement.classList.toggle('light', newTheme === 'light');
        document.documentElement.classList.toggle('custom', newTheme === 'custom');
        
        if (newTheme === 'custom') {
          const savedCustomTheme = localStorage.getItem('custom-theme');
          if (savedCustomTheme) {
            applyCustomTheme(JSON.parse(savedCustomTheme));
          }
        }
      }
      
      if (e.key === 'custom-theme' && e.newValue) {
        const parsed = JSON.parse(e.newValue);
        setCustomThemeState(parsed);
        if (theme === 'custom') {
          applyCustomTheme(parsed);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [mounted, theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('app-theme', newTheme);
    document.documentElement.classList.remove('dark', 'light', 'custom');
    document.documentElement.classList.add(newTheme);
    
    if (newTheme === 'custom' && customTheme) {
      applyCustomTheme(customTheme);
    }
    
    // Save theme mode to database
    if (newTheme === 'light' || newTheme === 'dark') {
      fetch('/api/user/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeMode: newTheme })
      }).catch(err => console.error('Failed to save theme:', err));
    }
    
    // Dispatch custom event for same-tab updates
    window.dispatchEvent(new CustomEvent('theme-change', { detail: newTheme }));
  };

  const toggleTheme = () => {
    // Simple toggle between dark and light
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  const setCustomTheme = (newCustomTheme: CustomTheme) => {
    setCustomThemeState(newCustomTheme);
    localStorage.setItem('custom-theme', JSON.stringify(newCustomTheme));
    
    if (theme === 'custom') {
      applyCustomTheme(newCustomTheme);
    }
    
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('custom-theme-change', { detail: newCustomTheme }));
  };

  // Always provide context, even during SSR
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, customTheme: customTheme || defaultCustomTheme, setCustomTheme, applyCustomTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

