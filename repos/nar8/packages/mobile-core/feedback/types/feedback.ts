/**
 * Feedback type definitions.
 * Re-exports from routine types for convenience.
 */

export type { RoutineFeedback, FeedbackCreate } from '../../routine/types/routine';

export type Mood = 'great' | 'ok' | 'stressed' | 'rushed';

export const MOOD_OPTIONS: Array<{ value: Mood; label: string; emoji: string }> = [
  { value: 'great', label: 'Great', emoji: '\u{1F60A}' },
  { value: 'ok', label: 'OK', emoji: '\u{1F610}' },
  { value: 'stressed', label: 'Stressed', emoji: '\u{1F630}' },
  { value: 'rushed', label: 'Rushed', emoji: '\u{1F3C3}' },
];

export const COMMON_BLOCKERS = [
  "Couldn't find something",
  'Slept through alarm',
  'Got distracted (phone)',
  'Unexpected interruption',
  'Bad weather',
  'Transport delay',
  'Took too long getting ready',
  'Forgot something / had to go back',
  'Kids / family needed attention',
  'Felt unwell',
];
