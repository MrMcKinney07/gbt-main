import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { SQLiteDatabase } from '../db/types';
import { getDatabase } from '../db/database';
import { seedDemoWalkbookIfEmpty } from '../db/localData';
import { createHttpApiClient, DEFAULT_API_BASE_URL, type ApiClient } from '../api/client';
import { SyncWorker } from '../sync/syncWorker';
import { wireSyncTriggers } from '../sync/triggers';

interface AppContextValue {
  db: SQLiteDatabase | null;
  api: ApiClient;
  syncWorker: SyncWorker | null;
  ready: boolean;
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [ready, setReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = accessToken;

  const apiRef = useRef<ApiClient>(
    createHttpApiClient({
      baseUrl: DEFAULT_API_BASE_URL,
      getAccessToken: () => tokenRef.current,
    })
  );
  const syncWorkerRef = useRef<SyncWorker | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const database = await getDatabase();
      await seedDemoWalkbookIfEmpty(database);
      if (cancelled) return;
      setDb(database);
      syncWorkerRef.current = new SyncWorker(database, apiRef.current);
      const teardown = wireSyncTriggers(syncWorkerRef.current);
      setReady(true);
      return teardown;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        db,
        api: apiRef.current,
        syncWorker: syncWorkerRef.current,
        ready,
        accessToken,
        setAccessToken,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
