import { View, Text, Button, StyleSheet } from 'react-native';
import { useState, useEffect } from 'react';
import { setupMobileReplicaSync } from '../src/lib/syncManager';
import { getMobileTursoClient } from '../src/lib/tursoClient';
import { setTursoConfig } from '../src/lib/tursoConfig';

export default function HomeScreen() {
  const [status, setStatus] = useState('Initializing...');

  useEffect(() => {
    // We just initialize the sync manager here to hook into AppState.
    // Real app would do this in a root layout or context.
    setupMobileReplicaSync();
  }, []);

  const handleManualSync = async () => {
    try {
      setStatus('Syncing...');
      const client = await getMobileTursoClient();
      await client.sync();
      setStatus('Sync Success!');
    } catch (e: any) {
      setStatus('Sync Failed: ' + e.message);
    }
  };

  const handleSetConfig = async () => {
    // In a real app this would be a proper settings form
    await setTursoConfig('libsql://your-db.turso.io', 'your-auth-token');
    setStatus('Config Saved. Try Syncing.');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mobile Sync Status</Text>
      <Text style={styles.status}>{status}</Text>
      
      <View style={styles.actions}>
        <Button title="1. Set Dummy Config" onPress={handleSetConfig} />
        <Button title="2. Force Sync" onPress={handleManualSync} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  status: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  actions: {
    gap: 16,
    width: '100%',
    maxWidth: 300,
  }
});
