/**
 * TestAudioDiscovery.tsx
 *
 * Temporary test component to verify new audio destination discovery.
 * Add this to your recording screen to test the new API.
 */

import { useState } from 'react';
import { View, Text, Button, ScrollView, StyleSheet } from 'react-native';
import { getAvailableAudioDestinations, buildRelayUrl, AudioDestination } from '../services/audioProviderApi';

interface TestAudioDiscoveryProps {
  baseUrl: string;
  token: string;
}

export function TestAudioDiscovery({ baseUrl, token }: TestAudioDiscoveryProps) {
  const [destinations, setDestinations] = useState<AudioDestination[]>([]);
  const [relayUrl, setRelayUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testDiscovery = async () => {
    try {
      setLoading(true);
      setError('');

      console.log('[Test] Querying destinations from:', `${baseUrl}/api/deployments/exposed-urls`);

      // Query available audio destinations
      const dests = await getAvailableAudioDestinations(baseUrl, token);

      console.log('[Test] Found destinations:', dests);
      setDestinations(dests);

      if (dests.length > 0) {
        // Build relay URL for all destinations
        const url = buildRelayUrl(baseUrl, token, dests);
        console.log('[Test] Built relay URL:', url);
        setRelayUrl(url);
      } else {
        setError('No audio destinations found');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Test] Failed:', errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🧪 Audio Discovery Test</Text>

      <Button
        title={loading ? "Testing..." : "Test Discovery"}
        onPress={testDiscovery}
        disabled={loading}
      />

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>❌ {error}</Text>
        </View>
      )}

      {destinations.length > 0 && (
        <ScrollView style={styles.resultsBox}>
          <Text style={styles.subtitle}>✅ Found {destinations.length} destination(s):</Text>

          {destinations.map((dest) => (
            <View key={dest.instance_id} style={styles.destCard}>
              <Text style={styles.destName}>📍 {dest.instance_name}</Text>
              <Text style={styles.destDetail}>ID: {dest.instance_id}</Text>
              <Text style={styles.destDetail}>URL: {dest.url}</Text>
              <Text style={styles.destDetail}>Status: {dest.status}</Text>
              {dest.metadata?.protocol && (
                <Text style={styles.destDetail}>Protocol: {dest.metadata.protocol}</Text>
              )}
            </View>
          ))}

          <View style={styles.relayBox}>
            <Text style={styles.subtitle}>🔗 Relay URL:</Text>
            <Text style={styles.relayUrl} numberOfLines={3}>
              {relayUrl}
            </Text>
          </View>
        </ScrollView>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          This tests the new deployment-based audio discovery.
          {'\n\n'}
          Expected flow:
          {'\n'}1. Query: GET /api/deployments/exposed-urls?type=audio
          {'\n'}2. Get list of Chronicle, Mycelia, etc.
          {'\n'}3. Build relay URL with all destinations
          {'\n'}4. Connect and stream to all simultaneously
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  errorText: {
    color: '#c62828',
  },
  resultsBox: {
    marginTop: 12,
    maxHeight: 400,
  },
  destCard: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  destName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  destDetail: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  relayBox: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  relayUrl: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#1565c0',
  },
  infoBox: {
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  infoText: {
    fontSize: 11,
    color: '#666',
  },
});
