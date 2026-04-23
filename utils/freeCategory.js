/**
 * Free Category & Hook Line, daily deterministic rotation.
 *
 * One category is free each day, rotating unpredictably using the date seed.
 * The hook line changes daily to keep the header fresh.
 * Both are stable within the day (same result every call on same date).
 */

import { getDailySeed, seededRandom } from '@/utils/dateUtils';

const CATEGORIES = ['love', 'career', 'money', 'mood'];

const HOOK_LINES = [
  'Your patterns are pointing somewhere.',
  'This showed up for you today.',
  'Pay attention to what repeats.',
  'Something is worth watching closely.',
  'The signal is there if you look.',
  'Things tend to land differently today.',
  'There is a pattern worth noticing today.',
  'Some days have a texture. This is one of them.',
];

/**
 * Returns today's free category.
 * Deterministic per calendar day. Rotates daily.
 */
export function getDailyFreeCategory() {
  const seed = getDailySeed();
  const idx = Math.floor(seededRandom(seed * 13 + 88881) * CATEGORIES.length);
  return CATEGORIES[idx];
}

/**
 * Returns today's hero hook line for the DayHeader.
 */
export function getDailyHookLine() {
  const seed = getDailySeed();
  const idx = Math.floor(seededRandom(seed * 17 + 77771) * HOOK_LINES.length);
  return HOOK_LINES[idx];
}

/**
 * Returns the display order of categories, with the free category first.
 */
export function getCategoryOrder(freeCategory) {
  const locked = CATEGORIES.filter((c) => c !== freeCategory);
  return [freeCategory, ...locked];
}

// ─── Today's Vibe, Moment, Watch For ────────────────────────────────────────

const VIBE_POOL = [
  'Unexpected interactions',
  'Things don\'t go as planned',
  'Emotional clarity',
  'Something resurfaces',
  'People say what they mean',
  'A small thing grows into something bigger',
  'Quiet tension, then release',
  'You notice things you\'ve been ignoring',
];

const MOMENT_POOL = [
  'Late afternoon',
  'Between 6, 9 PM',
  'When you least expect it',
  'Early evening',
  'Before lunch',
  'Mid-morning',
  'After 3 PM',
  'Just before you wind down',
];

const WATCH_FOR_POOL = [
  'a message you weren\'t expecting',
  'a delay that changes your plans',
  'a conversation that opens up unexpectedly',
  'a decision that feels bigger than it is',
  'a moment of unexpected clarity',
  'someone acting out of character',
  'a pattern you\'ve seen before',
  'something you\'ve been avoiding',
];

/** Returns today's vibe label. Deterministic per day. */
export function getDailyVibe() {
  const seed = getDailySeed();
  const idx = Math.floor(seededRandom(seed * 19 + 66661) * VIBE_POOL.length);
  return VIBE_POOL[idx];
}

/** Returns today's "most likely moment" string. Deterministic per day. */
export function getDailyMoment() {
  const seed = getDailySeed();
  const idx = Math.floor(seededRandom(seed * 23 + 55551) * MOMENT_POOL.length);
  return MOMENT_POOL[idx];
}

/** Returns today's "watch for" string. Deterministic per day. */
export function getDailyWatchFor() {
  const seed = getDailySeed();
  const idx = Math.floor(seededRandom(seed * 29 + 44441) * WATCH_FOR_POOL.length);
  return WATCH_FOR_POOL[idx];
}
