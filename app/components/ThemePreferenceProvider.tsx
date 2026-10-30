"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { isWorkbenchPath } from '@/lib/motes/motion-preferences';
import { parseThemePreference, resolveTheme, THEME_PREFERENCE_KEY, type ThemePreference } from '@/lib/motes/theme-preferences';

type ThemeContextValue = { preference: ThemePreference; setPreference: (value: ThemePreference) => void; storageUnavailable: boolean };
const ThemeContext = createContext<ThemeContextValue | null>(null);
let storedPreference: ThemePreference = 'light';
let storageFailed = false;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
function notify() { listeners.forEach(listener => listener()); }
function getPreference() { return storedPreference; }
function getStorageFailure() { return storageFailed; }
function getServerPreference(): ThemePreference { return 'light'; }
function getServerStorageFailure() { return false; }

export function useThemePreference() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useThemePreference must be used inside ThemePreferenceProvider');
  return value;
}

export default function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const preference = useSyncExternalStore(subscribe, getPreference, getServerPreference);
  const storageUnavailable = useSyncExternalStore(subscribe, getStorageFailure, getServerStorageFailure);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_PREFERENCE_KEY && event.key !== null) return;
      storedPreference = parseThemePreference(event.key === null ? null : event.newValue);
      storageFailed = false;
      notify();
    };
    try {
      storedPreference = parseThemePreference(localStorage.getItem(THEME_PREFERENCE_KEY));
    } catch {
      storageFailed = true;
    }
    window.addEventListener('storage', onStorage);
    notify();
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPreference = useCallback((value: ThemePreference) => {
    const safeValue = parseThemePreference(value);
    storedPreference = safeValue;
    try {
      localStorage.setItem(THEME_PREFERENCE_KEY, safeValue);
      storageFailed = false;
    } catch {
      storageFailed = true;
    }
    notify();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!isWorkbenchPath(pathname)) {
      delete root.dataset.motesTheme;
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => { root.dataset.motesTheme = resolveTheme(preference, media.matches); };
    update();
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
      delete root.dataset.motesTheme;
    };
  }, [pathname, preference]);

  const value = useMemo(() => ({ preference, setPreference, storageUnavailable }), [preference, setPreference, storageUnavailable]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
