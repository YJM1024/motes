import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPersistentStore, type DataApi } from './persistent-store';

/** Defaults and validator have useState initializer semantics for each data key. */
export function usePersistentState<T>(key: string, initialValue: T, validate?: (value: unknown) => boolean) {
  const [entry, setEntry] = useState(() => ({ key, store: createPersistentStore((window as unknown as { motes?: { data?: DataApi } }).motes?.data, key, initialValue, validate) }));
  if (entry.key !== key) setEntry({ key, store: createPersistentStore((window as unknown as { motes?: { data?: DataApi } }).motes?.data, key, initialValue, validate) });
  const store = entry.store;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.load(); return () => store.dispose(); }, [store]);
  return { ...state, update: store.update, reload: store.load, loading: state.phase === 'loading', saving: state.phase === 'saving', blocked: ['loading', 'conflict', 'error'].includes(state.phase) };
}

export function installPersistentState() {
  const target = window as unknown as { motes?: { usePersistentState?: typeof usePersistentState } };
  target.motes ??= {};
  target.motes.usePersistentState = usePersistentState;
}
