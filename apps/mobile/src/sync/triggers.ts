import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { SyncWorker } from './syncWorker';

/**
 * Wires the SyncWorker's three real-world triggers (network reconnect, app foreground,
 * periodic timer). Deliberately thin and side-effect-only — all the logic worth unit
 * testing lives in syncWorker.ts's drainOnce(), which this file never duplicates.
 *
 * Returns a teardown function.
 */
export function wireSyncTriggers(worker: SyncWorker, periodicIntervalMs = 30_000): () => void {
  let wasOffline = false;

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (isOnline && wasOffline) {
      void worker.trigger('reconnect');
    }
    wasOffline = !isOnline;
  });

  const onAppStateChange = (status: AppStateStatus) => {
    if (status === 'active') {
      void worker.trigger('foreground');
    }
  };
  const appStateSub = AppState.addEventListener('change', onAppStateChange);

  worker.startPeriodicTimer(periodicIntervalMs);

  return () => {
    unsubscribeNetInfo();
    appStateSub.remove();
    worker.stopPeriodicTimer();
  };
}
