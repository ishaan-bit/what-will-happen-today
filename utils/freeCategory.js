/**
 * Free Category & Hook Line — daily deterministic rotation.
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
