/**
 * Connection Log Types
 *
 * Tracks connection status changes across multiple subsystems:
 * - Network (internet connectivity)
 * - Server (backend API health)
 * - Bluetooth (device connection)
 * - WebSocket (audio streaming)
 */

export type ConnectionType = 'network' | 'server' | 'bluetooth' | 'websocket';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error' | 'unknown';

export interface ConnectionLogEntry {
  id: string;
  timestamp: Date;
  type: ConnectionType;
  status: ConnectionStatus;
  message: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectionState {
  network: ConnectionStatus;
  server: ConnectionStatus;
  bluetooth: ConnectionStatus;
  websocket: ConnectionStatus;
}

export const CONNECTION_TYPE_LABELS: Record<ConnectionType, string> = {
  network: 'Network',
  server: 'Server',
  bluetooth: 'Bluetooth',
  websocket: 'WebSocket',
};

export const CONNECTION_TYPE_EMOJIS: Record<ConnectionType, string> = {
  network: '\u{1F310}',
  server: '\u{2601}\u{FE0F}',
  bluetooth: '\u{1F4F6}',
  websocket: '\u{1F50C}',
};

export const CONNECTION_TYPE_COLORS: Record<ConnectionType, string> = {
  network: '#3B82F6',
  server: '#A855F7',
  bluetooth: '#06B6D4',
  websocket: '#10B981',
};

export const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: 'healthy',
  disconnected: 'unhealthy',
  connecting: 'checking',
  error: 'unhealthy',
  unknown: 'unknown',
};

export const STATUS_ICONS: Record<ConnectionStatus, string> = {
  connected: '\u{2713}',
  disconnected: '\u{2717}',
  connecting: '\u{25CC}',
  error: '!',
  unknown: '?',
};

export const generateLogId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const createInitialConnectionState = (): ConnectionState => ({
  network: 'unknown',
  server: 'disconnected',
  bluetooth: 'disconnected',
  websocket: 'disconnected',
});
