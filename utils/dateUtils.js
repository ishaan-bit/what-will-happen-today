// Date utilities – daily refresh logic and seed generation

/**
 * Returns today's date string as YYYYMMDD.
 */
export function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Returns a numeric seed derived from today's date.
 * Stable across the entire day, shifts daily.
 */
export function getDailySeed() {
  return parseInt(getTodayKey(), 10);
}

/**
 * Simple seeded pseudo-random number in [0, 1).
 * Uses a mulberry32 variant for good distribution.
 */
export function seededRandom(seed) {
  let s = seed >>> 0;
  s = Math.imul(48271, s) >>> 0;
  s += 0x6d2b79f5;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Picks a pseudo-random index for an array of given length,
 * using a composite seed combining the daily seed and a category offset.
 */
export function dailyIndex(arrayLength, categoryOffset = 0) {
  const seed = getDailySeed() + categoryOffset;
  return Math.floor(seededRandom(seed) * arrayLength);
}

/**
 * Returns a formatted display string for today.
 * e.g. "Monday, 21 April"
 */
export function getTodayLabel() {
  const now = new Date();
  return now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Returns midnight timestamp for today (start of day).
 * Used to determine when to reset unlock state.
 */
export function getTodayMidnight() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

/**
 * Returns true if the stored timestamp belongs to a previous day.
 */
export function isYesterday(timestamp) {
  if (!timestamp) return true;
  return timestamp < getTodayMidnight();
}
