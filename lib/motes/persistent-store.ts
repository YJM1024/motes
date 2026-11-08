export type PersistencePhase = 'loading' | 'ready' | 'saving' | 'saved' | 'temporary' | 'conflict' | 'error';
export type PersistenceState<T> = Readonly<{ value: T; revision: number; phase: PersistencePhase; message: string }>;
export type DataApi = {
  ready: Promise<{ available: boolean; error?: string }>;
  get(key: string): Promise<{ value: unknown; revision: number }>;
  set(key: string, value: unknown, expectedRevision: number): Promise<{ revision: number }>;
};

/** One store owns hydration and a serial CAS writer. Mounting never writes defaults. */
export function createPersistentStore<T>(api: DataApi | undefined, key: string, initialValue: T, validate: (value: unknown) => boolean = () => true) {
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(key) || !validate(initialValue)) throw new Error('持久化数据键或初始值无效。');
  const initial = structuredClone(initialValue);
  let snapshot: PersistenceState<T> = Object.freeze({ value: initial, revision: 0, phase: 'loading', message: '正在读取共享数据…' });
  const listeners = new Set<() => void>();
  let generation = 0, active = true, writing = false, queued = false, pending = initial;
  function publish(next: PersistenceState<T>) { snapshot = Object.freeze(next); for (const listener of listeners) listener(); }
  function valid(value: unknown) { try { return validate(value); } catch { return false; } }
  async function load() {
    if (writing) return false;
    active = true; const token = ++generation;
    publish({ ...snapshot, phase: 'loading', message: '正在读取共享数据…' });
    try {
      const status = await api?.ready;
      if (!active || token !== generation) return false;
      if (!api || !status?.available) { publish({ ...snapshot, phase: 'temporary', message: '当前仅作临时使用，内容不会保存到共享空间。' }); return true; }
      const record = await api.get(key);
      if (!active || token !== generation) return false;
      if (!Number.isSafeInteger(record.revision) || record.revision < 0 || (record.value !== null && !valid(record.value))) {
        publish({ ...snapshot, phase: 'error', message: '已保存数据的结构不兼容，未覆盖原数据。' }); return false;
      }
      const value = record.value === null && record.revision === 0 ? structuredClone(initial) : record.value;
      if (!valid(value)) { publish({ ...snapshot, phase: 'error', message: '已保存数据的结构不兼容，未覆盖原数据。' }); return false; }
      publish({ value: value as T, revision: record.revision, phase: 'ready', message: record.revision ? '共享数据已载入。' : '已连接共享数据，等待首次保存。' });
      return true;
    } catch {
      if (active && token === generation) publish({ ...snapshot, phase: 'error', message: '读取失败，未写入任何默认数据；请重新读取。' });
      return false;
    }
  }
  async function drain() {
    if (writing || !api) return;
    writing = true; const token = generation;
    try {
      while (queued && active && token === generation) {
        const value = pending; queued = false;
        const result = await api.set(key, value, snapshot.revision);
        if (!active || token !== generation) return;
        if (!Number.isSafeInteger(result.revision) || result.revision <= snapshot.revision) throw new Error('invalid receipt');
        publish({ ...snapshot, revision: result.revision, phase: queued ? 'saving' : 'saved', message: queued ? '正在保存最新内容…' : '已保存到共享空间。' });
      }
    } catch (error) {
      queued = false;
      if (active && token === generation) {
        const conflict = (error as { code?: string } | null)?.code === 'conflict';
        publish({ ...snapshot, phase: conflict ? 'conflict' : 'error', message: conflict ? '保存冲突，本页内容已保留，未覆盖其他访客的更新。请重新读取后确认。' : '保存结果未确认，本页内容已保留；请重新读取后再操作。' });
      }
    } finally { writing = false; }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    update(next: T | ((current: T) => T)): boolean {
      if (!active || ['loading', 'conflict', 'error'].includes(snapshot.phase)) return false;
      let value: T;
      try { value = structuredClone(typeof next === 'function' ? (next as (current: T) => T)(structuredClone(snapshot.value)) : next); } catch { return false; }
      if (!valid(value)) return false;
      if (snapshot.phase === 'temporary') { publish({ ...snapshot, value }); return true; }
      pending = value; queued = true;
      publish({ ...snapshot, value, phase: 'saving', message: '正在保存共享数据…' });
      void drain(); return true;
    },
    dispose() { active = false; ++generation; queued = false; },
  };
}
