/**
 * Routine type definitions — mirrors backend Routine / RoutineSession models.
 */

import type { LatLng } from '../../timeline/types/timeline';

export type GoalType = 'time' | 'location' | 'activity';
export type SessionStatus = 'recording' | 'processing' | 'complete' | 'abandoned';

export interface Routine {
  routine_id: string;
  user_id: string;
  name: string;
  goal: string;
  goal_type: GoalType;
  goal_location?: LatLng;
  goal_time?: string;   // HH:MM
  start_location?: LatLng;
  tags: string[];
  archived: boolean;
  created_at: string;   // ISO datetime
  updated_at: string;   // ISO datetime
}

export interface RoutineCreate {
  name: string;
  goal: string;
  goal_type?: GoalType;
  goal_location?: LatLng;
  goal_time?: string;
  start_location?: LatLng;
  tags?: string[];
}

export interface RoutineUpdate {
  name?: string;
  goal?: string;
  goal_type?: GoalType;
  goal_location?: LatLng;
  goal_time?: string;
  start_location?: LatLng;
  tags?: string[];
  archived?: boolean;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  timestamp: string;
  accuracy_m?: number;
}

export interface RoutineSession {
  session_id: string;
  routine_id: string;
  user_id: string;
  started_at: string;
  ended_at?: string;
  status: SessionStatus;
  goal_reached: boolean;
  audio_source: 'microphone' | 'omi';
  conversation_id?: string;
  location_track: LocationPoint[];
}

export interface SessionStart {
  audio_source?: 'microphone' | 'omi';
  conversation_id?: string;
}

export interface SessionEnd {
  goal_reached?: boolean;
}

export interface RoutineFeedback {
  feedback_id: string;
  session_id: string;
  user_id: string;
  overall_rating: number;
  on_time: boolean;
  blockers: string[];
  blocker_details?: string;
  mood: 'great' | 'ok' | 'stressed' | 'rushed';
  sleep_quality?: number;
  external_factors: string[];
  suggestions?: string;
  created_at: string;
}

export interface FeedbackCreate {
  overall_rating: number;
  on_time?: boolean;
  blockers?: string[];
  blocker_details?: string;
  mood?: string;
  sleep_quality?: number;
  external_factors?: string[];
  suggestions?: string;
}

export interface TrendData {
  sessions: Array<{
    session_id: string;
    started_at: string;
    total_duration_seconds: number;
    total_duration_minutes: number;
    goal_reached: boolean;
    day_of_week: string;
    event_count: number;
  }>;
  activity_averages: Record<string, {
    avg_seconds: number;
    min_seconds: number;
    max_seconds: number;
    count: number;
  }>;
  blocker_counts: Record<string, number>;
}

export interface Suggestion {
  type: 'reorder' | 'parallelise' | 'eliminate' | 'timebox' | 'prepare';
  title: string;
  description: string;
  estimated_savings_minutes: number;
}

export interface AnalysisResult {
  summary: string;
  total_sessions: number;
  avg_duration_minutes: number;
  best_duration_minutes: number;
  worst_duration_minutes: number;
  suggestions: Suggestion[];
  recurring_blockers: Array<{
    blocker: string;
    frequency_pct: number;
    suggestion: string;
  }>;
  improvements: string;
}
