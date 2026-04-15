/**
 * useTimeline — Fetch and manage timeline data for a session.
 *
 * Handles loading timeline events from the backend and triggering extraction.
 */

import { useState, useCallback } from 'react';
import type { TimelineData, TimelineExtractRequest } from '../types/timeline';

interface UseTimelineOptions {
  /** Base URL for the ushadow API. */
  baseUrl: string;
  /** Auth token getter. */
  getToken: () => Promise<string | null>;
}

interface UseTimelineReturn {
  timeline: TimelineData | null;
  isLoading: boolean;
  isExtracting: boolean;
  error: string | null;
  fetchTimeline: (sessionId: string) => Promise<void>;
  extractTimeline: (request: TimelineExtractRequest) => Promise<TimelineData | null>;
}

export function useTimeline({ baseUrl, getToken }: UseTimelineOptions): UseTimelineReturn {
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(async () => {
    const token = await getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getToken]);

  const fetchTimeline = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const h = await headers();
      const res = await fetch(`${baseUrl}/api/timeline/sessions/${sessionId}`, {
        headers: h,
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch timeline: ${res.status}`);
      }
      const data: TimelineData = await res.json();
      setTimeline(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, headers]);

  const extractTimeline = useCallback(async (request: TimelineExtractRequest): Promise<TimelineData | null> => {
    setIsExtracting(true);
    setError(null);
    try {
      const h = await headers();
      const res = await fetch(`${baseUrl}/api/timeline/extract`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        throw new Error(`Timeline extraction failed: ${res.status}`);
      }
      const data: TimelineData = await res.json();
      setTimeline(data);
      return data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setIsExtracting(false);
    }
  }, [baseUrl, headers]);

  return {
    timeline,
    isLoading,
    isExtracting,
    error,
    fetchTimeline,
    extractTimeline,
  };
}
