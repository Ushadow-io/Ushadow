/**
 * Streaming Session Types
 *
 * Tracks audio streaming sessions with metadata:
 * - Source (OMI device or phone microphone)
 * - Destinations (Chronicle, Mycelia, etc.)
 * - Duration and data volume
 * - Connection to Chronicle conversation_id (if available)
 */

export type SessionSource =
  | { type: 'omi'; deviceId: string; deviceName?: string }
  | { type: 'microphone' };

export interface SessionDestination {
  name: string;
  url: string;
  connected: boolean;
  errors: number;
}

export interface StreamingSession {
  id: string;                        // Client-generated session ID
  source: SessionSource;             // Audio source
  destinations: SessionDestination[]; // Audio destinations
  startTime: Date;                   // Session start timestamp
  endTime?: Date;                    // Session end timestamp (null if active)
  durationSeconds?: number;          // Calculated duration
  bytesTransferred: number;          // Total bytes relayed
  chunksTransferred: number;         // Total audio chunks relayed
  conversationId?: string;           // Chronicle conversation_id (if available)
  codec: 'pcm' | 'opus';            // Audio codec used
  networkType?: string;              // WiFi, cellular, etc.
  error?: string;                    // Error message if session failed
  endReason?: 'manual_stop' | 'connection_lost' | 'error' | 'timeout'; // How the session ended
  diagnostics?: SessionDiagnostics;  // Background streaming health data
}

/** Cumulative diagnostics for a streaming session's connection health */
export interface SessionDiagnostics {
  reconnectCount: number;            // Total WebSocket reconnections during session
  backgroundGapCount: number;        // Number of background disconnection gaps
  totalBackgroundMs: number;         // Total time spent in background gaps (ms)
  totalBufferedChunks: number;       // Total audio chunks buffered during gaps
  totalDroppedChunks: number;        // Total audio chunks dropped (buffer full)
  totalFlushedChunks: number;        // Total buffered chunks successfully sent after reconnect
  healthCheckReconnects: number;     // Reconnections triggered by health check timer
}

export interface SessionState {
  activeSessions: Map<string, StreamingSession>; // Currently active sessions
  recentSessions: StreamingSession[];             // Historical sessions
}

// Helper to generate session ID
export const generateSessionId = (): string => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper to format duration
export const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

// Helper to format bytes
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Helper to get session duration in seconds
export const getSessionDuration = (session: StreamingSession): number => {
  if (session.durationSeconds !== undefined) return session.durationSeconds;
  const start = new Date(session.startTime).getTime();
  const end = session.endTime ? new Date(session.endTime).getTime() : Date.now();
  return Math.floor((end - start) / 1000);
};

// Helper to check if session is active
export const isSessionActive = (session: StreamingSession): boolean => {
  return !session.endTime;
};
