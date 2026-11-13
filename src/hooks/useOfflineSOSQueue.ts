import { useCallback, useEffect, useState } from 'react';
import type { SOSCategory } from '../types.ts';

export interface OfflineSOSPayload {
  idempotencyKey: string;
  category: SOSCategory;
  description: string;
  lat: number;
  lng: number;
  locality: string;
  reporterName?: string;
  reporterMobile?: string;
  queuedAt: string;
}

const STORAGE_KEY = 'alertnet_offline_sos_queue';

function readQueue(): OfflineSOSPayload[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OfflineSOSPayload[]) : [];
  } catch {
    return [];
  }
}

export function useOfflineSOSQueue(
  token: string | null,
  onSynced?: () => void
) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [queuedReports, setQueuedReports] = useState<OfflineSOSPayload[]>(() => readQueue());
  const [syncing, setSyncing] = useState(false);

  const persist = (items: OfflineSOSPayload[]) => {
    setQueuedReports(items);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage quota errors
    }
  };

  const enqueueOfflineSOS = useCallback((item: OfflineSOSPayload) => {
    const current = readQueue();
    if (!current.some((c) => c.idempotencyKey === item.idempotencyKey)) {
      const next = [...current, item];
      persist(next);
    }
  }, []);

  const flushQueue = useCallback(async () => {
    const pending = readQueue();
    if (!pending.length || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0;

    setSyncing(true);
    let syncedCount = 0;
    const remaining: OfflineSOSPayload[] = [];

    for (const item of pending) {
      try {
        const res = await fetch('/api/sos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ ...item, syncedFromOffline: true }),
        });
        if (res.ok) {
          syncedCount++;
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    persist(remaining);
    setSyncing(false);
    if (syncedCount > 0 && onSynced) {
      onSynced();
    }
    return syncedCount;
  }, [token, onSynced]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void flushQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushQueue]);

  return {
    isOnline,
    queuedReports,
    syncing,
    enqueueOfflineSOS,
    flushQueue,
  };
}
