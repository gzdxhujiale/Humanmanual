import { createSyncEngine } from '@humanmanual/core';
import { getMobileTursoClient } from './tursoClient';
import { logError, logSilent } from '@humanmanual/core';
import { AppState } from 'react-native';

export const mobileSyncEngine = createSyncEngine();

/**
 * Sets up background/foreground Turso remote replica synchronization.
 * In a local replica model, writes are made to the local SQLite DB instantly,
 * and we call `client.sync()` to push/pull from the Turso Edge.
 */
export function setupMobileReplicaSync() {
  let isSyncing = false;

  const syncReplica = async () => {
    if (isSyncing) return;
    isSyncing = true;
    try {
      const client = await getMobileTursoClient();
      await client.sync();
      logSilent('SyncManager', 'Turso local replica synced with edge.');
    } catch (e) {
      logError('SyncManager', 'Turso replica sync failed', e);
    } finally {
      isSyncing = false;
    }
  };

  // Sync immediately on setup
  syncReplica();

  // Sync when the app comes back to the foreground
  AppState.addEventListener('change', (nextAppState) => {
    if (nextAppState === 'active') {
      syncReplica();
    }
  });
}
