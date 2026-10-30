"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { isWorkbenchPath } from '@/lib/motes/motion-preferences';
import { HOST_LOCALE_KEY, parseHostLocale, translateHostMessage, type HostLocale, type HostMessageKey, type HostMessageParams } from '@/lib/motes/locale';

type Translate = (key: HostMessageKey, params?: HostMessageParams) => string;
type LocaleContextValue = { locale: HostLocale; setLocale: (locale: HostLocale) => void; t: Translate; tText: Translate; ready: boolean; storageStatus: 'loading' | 'local' | 'memory' };
const LocaleContext = createContext<LocaleContextValue | null>(null);
let state = { locale: 'zh-CN' as HostLocale, ready: false, unavailable: false };
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function notify() { listeners.forEach(listener => listener()); }
function snapshot() { return state; }
const serverState = { locale: 'zh-CN' as HostLocale, ready: false, unavailable: false };
function serverSnapshot() { return serverState; }

export function hostText(key: HostMessageKey, params?: HostMessageParams): string { return translateHostMessage(state.locale, key, params); }

export function useHostLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useHostLocale must be used inside HostLocaleProvider');
  return context;
}

export default function HostLocaleProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    try { state = { locale: parseHostLocale(localStorage.getItem(HOST_LOCALE_KEY)), ready: true, unavailable: false }; }
    catch { state = { ...state, ready: true, unavailable: true }; }
    notify();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== HOST_LOCALE_KEY && event.key !== null) return;
      try { if (event.storageArea !== localStorage) return; } catch { return; }
      state = { locale: parseHostLocale(event.newValue), ready: true, unavailable: false };
      notify();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const setLocale = useCallback((locale: HostLocale) => {
    const next = parseHostLocale(locale);
    let unavailable = false;
    try { localStorage.setItem(HOST_LOCALE_KEY, next); } catch { unavailable = true; }
    state = { locale: next, ready: true, unavailable };
    notify();
  }, []);
  useEffect(() => {
    // Public documents retain their own language and never inherit workbench preferences.
    if (!isWorkbenchPath(pathname)) return;
    document.documentElement.lang = current.locale;
    return () => { document.documentElement.lang = 'zh-CN'; };
  }, [pathname, current.locale]);
  const t = useCallback<Translate>((key, params) => translateHostMessage(current.locale, key, params), [current.locale]);
  const value = useMemo<LocaleContextValue>(() => ({ locale: current.locale, setLocale, t, tText: t, ready: current.ready, storageStatus: !current.ready ? 'loading' : current.unavailable ? 'memory' : 'local' }), [current, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
