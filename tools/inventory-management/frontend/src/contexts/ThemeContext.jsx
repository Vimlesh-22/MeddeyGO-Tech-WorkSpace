import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(undefined);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Read theme from localStorage
    const savedTheme = localStorage.getItem('app-theme');
    
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setThemeState(savedTheme);
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(savedTheme);
    } else {
      // Default to dark theme
      document.documentElement.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Listen for theme changes from other tabs
    const handleStorageChange = (e) => {
      if (e.key === 'app-theme' && e.newValue) {
        const newTheme = e.newValue;
        setThemeState(newTheme);
        document.documentElement.classList.remove('dark', 'light');
        document.documentElement.classList.add(newTheme);
      }
    };

    // Listen for custom theme-change events (same-tab updates)
    const handleThemeChange = (e) => {
      const newTheme = e.detail;
      if (newTheme === 'light' || newTheme === 'dark') {
        setThemeState(newTheme);
        document.documentElement.classList.remove('dark', 'light');
        document.documentElement.classList.add(newTheme);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('theme-change', handleThemeChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('theme-change', handleThemeChange);
    };
  }, [mounted]);

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    localStorage.setItem('app-theme', newTheme);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(newTheme);
    
    // Dispatch custom event for same-tab updates
    window.dispatchEvent(new CustomEvent('theme-change', { detail: newTheme }));
  };

  const toggleTheme = () => {
    // Simple toggle between dark and light
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
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