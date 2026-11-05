'use client';
import { useEffect } from 'react';
import { retireOfflineWorker } from '@/lib/motes/retire-offline-worker';

export default function LiteOfflineRetirement() {
  useEffect(() => {
    if ('serviceWorker' in navigator) void retireOfflineWorker(navigator.serviceWorker, location.origin);
  }, []);
  return null;
}
