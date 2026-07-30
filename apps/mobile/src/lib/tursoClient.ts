import { createClient, Client } from '@libsql/client';
import { getTursoConfig } from './tursoConfig';
import { logError } from '@humanmanual/core';

let _client: Client | null = null;

export async function getMobileTursoClient(): Promise<Client> {
  if (_client) return _client;

  const { url, token } = await getTursoConfig();

  if (!url || !token) {
    throw new Error('Turso Sync is not configured. Please configure URL and Token in settings.');
  }

  try {
    _client = createClient({
      // React Native defaults for @libsql/client
      // "file:mobile.db" uses local storage (expo-sqlite internally if polyfilled, or the native RN lib)
      url: 'file:mobile.db',
      syncUrl: url,
      authToken: token,
    });
    
    // Attempt an initial sync
    await _client.sync();
    return _client;
  } catch (e) {
    logError('MobileTursoClient', 'Failed to initialize Turso client', e);
    throw e;
  }
}

export function resetMobileTursoClient() {
  if (_client) {
    _client.close();
    _client = null;
  }
}
