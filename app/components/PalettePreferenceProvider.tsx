'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { isWorkbenchPath } from '@/lib/motes/motion-preferences';
import { PALETTE_PREFERENCE_KEY, parsePalettePreference, resolvePalette, type PalettePreference } from '@/lib/motes/palette-preferences';

type PaletteContextValue = { preference: PalettePreference; setPreference: (value: PalettePreference) => void; storageUnavailable: boolean };
const PaletteContext = createContext<PaletteContextValue | null>(null);
let storedPreference: PalettePreference = 'slate';
let storageFailed = false;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
function notify() { listeners.forEach(listener => listener()); }
function getPreference() { return storedPreference; }
function getStorageFailure() { return storageFailed; }
function getServerPreference(): PalettePreference { return 'slate'; }
function getServerStorageFailure() { return false; }

export function usePalettePreference() {
  const value = useContext(PaletteContext);
  if (!value) throw new Error('usePalettePreference must be used inside PalettePreferenceProvider');
  return value;
}

export default function PalettePreferenceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const preference = useSyncExternalStore(subscribe, getPreference, getServerPreference);
  const storageUnavailable = useSyncExternalStore(subscribe, getStorageFailure, getServerStorageFailure);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PALETTE_PREFERENCE_KEY && event.key !== null) return;
      storedPreference = parsePalettePreference(event.key === null ? null : event.newValue);
      storageFailed = false;
      notify();
    };
    try {
      storedPreference = parsePalettePreference(localStorage.getItem(PALETTE_PREFERENCE_KEY));
      storageFailed = false;
    } catch {
      storageFailed = true;
    }
    window.addEventListener('storage', onStorage);
    notify();
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPreference = useCallback((value: PalettePreference) => {
    const safeValue = parsePalettePreference(value);
    storedPreference = safeValue;
    try {
      localStorage.setItem(PALETTE_PREFERENCE_KEY, safeValue);
      storageFailed = false;
    } catch {
      storageFailed = true;
    }
    notify();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!isWorkbenchPath(pathname)) {
      delete root.dataset.motesPalette;
      return;
    }
    root.dataset.motesPalette = resolvePalette(preference);
    return () => { delete root.dataset.motesPalette; };
  }, [pathname, preference]);

  const value = useMemo(() => ({ preference, setPreference, storageUnavailable }), [preference, setPreference, storageUnavailable]);
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}
