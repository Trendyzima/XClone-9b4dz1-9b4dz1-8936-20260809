import { useState, useEffect } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ThemeChoice = 'light' | 'dark' | 'system';

/** Detect actual OS preference */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Reads the stored user choice (may be 'system') */
export function getStoredThemeChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem('theme') as ThemeChoice | null;
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system'; // default to system
}

/** Applies the effective theme class to <html> */
export function applyTheme(choice: ThemeChoice) {
  const actual = choice === 'system' ? getSystemTheme() : choice;
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(actual);
  root.style.colorScheme = actual;
  localStorage.setItem('theme', choice);
}

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  // Hydrate from localStorage in effect to avoid esbuild lazy-initializer non-determinism
  useEffect(() => {
    setChoice(getStoredThemeChoice());
  }, []);

  // Apply on mount and listen for system changes when in 'system' mode
  useEffect(() => {
    applyTheme(choice);
    if (choice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [choice]);

  // Module-level theme cycle — no typed array in function body (esbuild guard)
  const toggle = () => {
    const next: ThemeChoice =
      choice === 'light' ? 'dark' : choice === 'dark' ? 'system' : 'light';
    setChoice(next);
    applyTheme(next);
  };

  const effectiveTheme = choice === 'system' ? getSystemTheme() : choice;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="rounded-full h-9 px-2.5 gap-1.5 text-xs font-semibold"
      title={`Theme: ${choice} (click to cycle)`}
      aria-label="Toggle theme"
    >
      {effectiveTheme === 'dark' ? (
        <Moon className="w-4 h-4 text-blue-400" />
      ) : choice === 'system' ? (
        <Monitor className="w-4 h-4 text-muted-foreground" />
      ) : (
        <Sun className="w-4 h-4 text-yellow-500" />
      )}
      <span className="hidden sm:inline text-muted-foreground capitalize">{choice}</span>
    </Button>
  );
}
