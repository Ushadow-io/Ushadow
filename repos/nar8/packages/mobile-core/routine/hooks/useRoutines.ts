/**
 * useRoutines — CRUD operations for routines.
 *
 * Provides create, list, update, and archive operations against the backend API.
 */

import { useState, useCallback } from 'react';
import type {
  Routine,
  RoutineCreate,
  RoutineUpdate,
  RoutineSession,
  SessionStart,
  SessionEnd,
  FeedbackCreate,
  RoutineFeedback,
  TrendData,
  AnalysisResult,
} from '../types/routine';

interface UseRoutinesOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
}

interface UseRoutinesReturn {
  routines: Routine[];
  isLoading: boolean;
  error: string | null;
  fetchRoutines: (includeArchived?: boolean) => Promise<void>;
  createRoutine: (data: RoutineCreate) => Promise<Routine | null>;
  updateRoutine: (routineId: string, data: RoutineUpdate) => Promise<Routine | null>;
  archiveRoutine: (routineId: string) => Promise<boolean>;
  startSession: (routineId: string, data?: SessionStart) => Promise<RoutineSession | null>;
  endSession: (sessionId: string, data?: SessionEnd) => Promise<RoutineSession | null>;
  listSessions: (routineId: string) => Promise<RoutineSession[]>;
  submitFeedback: (sessionId: string, data: FeedbackCreate) => Promise<RoutineFeedback | null>;
  getTrends: (routineId: string) => Promise<TrendData | null>;
  getSuggestions: (routineId: string) => Promise<AnalysisResult | null>;
}

export function useRoutines({ baseUrl, getToken }: UseRoutinesOptions): UseRoutinesReturn {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(async () => {
    const token = await getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getToken]);

  const apiFetch = useCallback(async (path: string, options?: RequestInit) => {
    const h = await headers();
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...h, ...options?.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${body || res.statusText}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }, [baseUrl, headers]);

  // ── Routines ────────────────────────────────────────────────────

  const fetchRoutines = useCallback(async (includeArchived = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = includeArchived ? '?include_archived=true' : '';
      const data = await apiFetch(`/api/routines${qs}`);
      setRoutines(data.routines);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  const createRoutine = useCallback(async (data: RoutineCreate): Promise<Routine | null> => {
    setError(null);
    try {
      return await apiFetch('/api/routines', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [apiFetch]);

  const updateRoutine = useCallback(async (routineId: string, data: RoutineUpdate): Promise<Routine | null> => {
    setError(null);
    try {
      return await apiFetch(`/api/routines/${routineId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [apiFetch]);

  const archiveRoutine = useCallback(async (routineId: string): Promise<boolean> => {
    setError(null);
    try {
      await apiFetch(`/api/routines/${routineId}`, { method: 'DELETE' });
      setRoutines((prev) => prev.filter((r) => r.routine_id !== routineId));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, [apiFetch]);

  // ── Sessions ────────────────────────────────────────────────────

  const startSession = useCallback(async (routineId: string, data: SessionStart = {}): Promise<RoutineSession | null> => {
    setError(null);
    try {
      return await apiFetch(`/api/routines/${routineId}/sessions`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [apiFetch]);

  const endSession = useCallback(async (sessionId: string, data: SessionEnd = {}): Promise<RoutineSession | null> => {
    setError(null);
    try {
      return await apiFetch(`/api/sessions/${sessionId}/end`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [apiFetch]);

  const listSessions = useCallback(async (routineId: string): Promise<RoutineSession[]> => {
    try {
      const data = await apiFetch(`/api/routines/${routineId}/sessions`);
      return data.sessions;
    } catch (e) {
      setError((e as Error).message);
      return [];
    }
  }, [apiFetch]);

  // ── Feedback ────────────────────────────────────────────────────

  const submitFeedback = useCallback(async (sessionId: string, data: FeedbackCreate): Promise<RoutineFeedback | null> => {
    setError(null);
    try {
      return await apiFetch(`/api/sessions/${sessionId}/feedback`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [apiFetch]);

  // ── Analysis ────────────────────────────────────────────────────

  const getTrends = useCallback(async (routineId: string): Promise<TrendData | null> => {
    try {
      return await apiFetch(`/api/routines/${routineId}/trends`);
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [apiFetch]);

  const getSuggestions = useCallback(async (routineId: string): Promise<AnalysisResult | null> => {
    try {
      return await apiFetch(`/api/routines/${routineId}/suggestions`);
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [apiFetch]);

  return {
    routines,
    isLoading,
    error,
    fetchRoutines,
    createRoutine,
    updateRoutine,
    archiveRoutine,
    startSession,
    endSession,
    listSessions,
    submitFeedback,
    getTrends,
    getSuggestions,
  };
}
