/**
 * Timeline type definitions — mirrors backend TimelineEvent model.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export type EventCategory =
  | 'hygiene'
  | 'food'
  | 'clothing'
  | 'organisation'
  | 'transport'
  | 'leisure'
  | 'work'
  | 'waiting'
  | 'other';

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'frustrated';

export interface TimelineEvent {
  event_id: string;
  session_id: string;
  activity: string;
  category: EventCategory;
  started_at: string;  // ISO datetime
  ended_at: string;    // ISO datetime
  duration_seconds: number;
  location?: LatLng;
  notes?: string;
  sentiment?: Sentiment;
  is_productive: boolean;
  is_transition: boolean;
}

export interface TimelineData {
  session_id: string;
  event_count: number;
  events: TimelineEvent[];
}

export interface TimelineExtractRequest {
  session_id: string;
  transcript: string;
  routine_name?: string;
  goal?: string;
}

/** Colour mapping for event categories (used by timeline components). */
export const CATEGORY_COLORS: Record<EventCategory, string> = {
  hygiene: '#4FC3F7',
  food: '#FFB74D',
  clothing: '#CE93D8',
  organisation: '#90CAF9',
  transport: '#A5D6A7',
  leisure: '#EF9A9A',
  work: '#80CBC4',
  waiting: '#E0E0E0',
  other: '#B0BEC5',
};

/** Emoji mapping for categories. */
export const CATEGORY_ICONS: Record<EventCategory, string> = {
  hygiene: '\u{1F6BF}',     // shower
  food: '\u{1F373}',        // cooking
  clothing: '\u{1F455}',    // t-shirt
  organisation: '\u{1F4CB}', // clipboard
  transport: '\u{1F68C}',   // bus
  leisure: '\u{1F3AE}',     // game controller
  work: '\u{1F4BB}',        // laptop
  waiting: '\u{23F3}',      // hourglass
  other: '\u{2754}',        // question mark
};
