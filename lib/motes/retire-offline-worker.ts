/** Retire only this product's former root service worker; never clear user storage. */
export async function retireOfflineWorker(
  serviceWorkers: Pick<ServiceWorkerContainer, 'getRegistrations'>,
  origin: string,
): Promise<{ removed: number; failed: number }> {
  const root = new URL('/', origin).href;
  const script = new URL('/motes-offline-sw.js', origin).href;
  let registrations: readonly ServiceWorkerRegistration[];
  try { registrations = await serviceWorkers.getRegistrations(); }
  catch { return { removed: 0, failed: 1 }; }
  const owned = registrations.filter(registration => {
    if (registration.scope !== root) return false;
    const workers = [registration.active, registration.waiting, registration.installing].filter(Boolean);
    // A different active/waiting worker must not be removed just because a stale
    // worker happens to be present in another lifecycle slot.
    return workers.length > 0 && workers.every(worker => worker!.scriptURL === script);
  });
  const results = await Promise.allSettled(owned.map(registration => registration.unregister()));
  return {
    removed: results.filter(result => result.status === 'fulfilled' && result.value).length,
    failed: results.filter(result => result.status === 'rejected' || !result.value).length,
  };
}
