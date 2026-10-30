"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { isWorkbenchPath, MOTION_PREFERENCE_KEY, parseMotionPreference, shouldReduceMotion, type MotionPreference } from '@/lib/motes/motion-preferences';

type MotionContextValue = { preference: MotionPreference; setPreference: (value: MotionPreference) => void; storageUnavailable: boolean };
const MotionContext = createContext<MotionContextValue | null>(null);
let storedPreference: MotionPreference = 'system';
let storageFailed = false;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
function notify() { listeners.forEach(listener => listener()); }
function getPreference() { return storedPreference; }
function getStorageFailure() { return storageFailed; }
function getServerPreference(): MotionPreference { return 'system'; }
function getServerStorageFailure() { return false; }

export function useMotionPreference() {
  const value = useContext(MotionContext);
  if (!value) throw new Error('useMotionPreference must be used inside MotionPreferenceProvider');
  return value;
}

export default function MotionPreferenceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const preference = useSyncExternalStore(subscribe, getPreference, getServerPreference);
  const storageUnavailable = useSyncExternalStore(subscribe, getStorageFailure, getServerStorageFailure);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(MOTION_PREFERENCE_KEY);
      storedPreference = parseMotionPreference(stored);
    } catch {
      storageFailed = true;
    }
    notify();
  }, []);

  const setPreference = useCallback((value: MotionPreference) => {
    const safeValue = parseMotionPreference(value);
    storedPreference = safeValue;
    try {
      localStorage.setItem(MOTION_PREFERENCE_KEY, safeValue);
      storageFailed = false;
    } catch {
      storageFailed = true;
    }
    notify();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!isWorkbenchPath(pathname)) {
      delete root.dataset.motesMotion;
      return;
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      if (shouldReduceMotion(preference, media.matches)) root.dataset.motesMotion = 'reduced';
      else delete root.dataset.motesMotion;
    };
    update();
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
      delete root.dataset.motesMotion;
    };
  }, [pathname, preference]);

  const value = useMemo(() => ({ preference, setPreference, storageUnavailable }), [preference, setPreference, storageUnavailable]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
