'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const handleToggle = () => {
    // Simple toggle between dark and light only
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <motion.button
      onClick={handleToggle}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/80 backdrop-blur-sm transition-colors hover:bg-muted"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Toggle theme"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={theme}
          initial={{ rotate: -180, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          exit={{ rotate: 180, scale: 0 }}
          transition={{ duration: 0.3 }}
        >
          {theme === 'dark' ? (
            <Moon className="h-5 w-5 text-foreground" />
          ) : (
            <Sun className="h-5 w-5 text-foreground" />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.button>
  );
}
