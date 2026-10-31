'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { isWorkbenchPath } from '@/lib/motes/motion-preferences';
import { PALETTE_PREFERENCE_KEY, parsePalettePreference, resolvePalette, type PalettePreference } from '@/lib/motes/palette-preferences';

type PaletteContextValue = {
  preference: PalettePreference;
  setPreference: (value: PalettePreference) => void;
  previewPalette: (value: PalettePreference) => void;
  clearPreview: () => void;
  storageUnavailable: boolean;
};
const PaletteContext = createContext<PaletteContextValue | null>(null);
let storedPreference: PalettePreference = 'slate';
let previewPreference: PalettePreference | null = null;
let storageFailed = false;
let preferenceLoaded = false;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
function notify() { listeners.forEach(listener => listener()); }
function getPreference() { return storedPreference; }
function getPreviewPreference() { return previewPreference; }
function getStorageFailure() { return storageFailed; }
function getPreferenceLoaded() { return preferenceLoaded; }
function getServerPreference(): PalettePreference { return 'slate'; }
function getServerPreviewPreference(): PalettePreference | null { return null; }
function getServerStorageFailure() { return false; }
function getServerPreferenceLoaded() { return false; }

export function usePalettePreference() {
  const value = useContext(PaletteContext);
  if (!value) throw new Error('usePalettePreference must be used inside PalettePreferenceProvider');
  return value;
}

export default function PalettePreferenceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const preference = useSyncExternalStore(subscribe, getPreference, getServerPreference);
  const preview = useSyncExternalStore(subscribe, getPreviewPreference, getServerPreviewPreference);
  const storageUnavailable = useSyncExternalStore(subscribe, getStorageFailure, getServerStorageFailure);
  const loaded = useSyncExternalStore(subscribe, getPreferenceLoaded, getServerPreferenceLoaded);

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
    preferenceLoaded = true;
    window.addEventListener('storage', onStorage);
    notify();
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPreference = useCallback((value: PalettePreference) => {
    const safeValue = parsePalettePreference(value);
    storedPreference = safeValue;
    previewPreference = null;
    try {
      localStorage.setItem(PALETTE_PREFERENCE_KEY, safeValue);
      storageFailed = false;
    } catch {
      storageFailed = true;
    }
    notify();
  }, []);

  const previewPalette = useCallback((value: PalettePreference) => {
    const safeValue = parsePalettePreference(value);
    if (previewPreference === safeValue) return;
    previewPreference = safeValue;
    notify();
  }, []);

  const clearPreview = useCallback(() => {
    if (previewPreference === null) return;
    previewPreference = null;
    notify();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!isWorkbenchPath(pathname)) {
      delete root.dataset.motesPalette;
      delete root.dataset.motesPaletteReady;
      return;
    }
    root.dataset.motesPalette = resolvePalette(preference, preview);
  }, [pathname, preference, preview]);

  const workbenchPath = isWorkbenchPath(pathname);
  useEffect(() => {
    const root = document.documentElement;
    if (!workbenchPath || !loaded) {
      delete root.dataset.motesPaletteReady;
      return;
    }
    const frame = window.requestAnimationFrame(() => { root.dataset.motesPaletteReady = 'true'; });
    return () => {
      window.cancelAnimationFrame(frame);
      delete root.dataset.motesPaletteReady;
      if (workbenchPath) delete root.dataset.motesPalette;
    };
  }, [workbenchPath, loaded]);

  const value = useMemo(() => ({ preference, setPreference, previewPalette, clearPreview, storageUnavailable }), [preference, setPreference, previewPalette, clearPreview, storageUnavailable]);
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}
