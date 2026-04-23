import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTodayKey, isYesterday } from '@/utils/dateUtils';

// Storage key constants
const KEYS = {
  LAST_OPENED: 'wwht:lastOpened',
  TODAY_PREDICTIONS: 'wwht:todayPredictions',
  RECENT_IDS: (cat) => `wwht:recentIds:${cat}`,
  UNLOCK_TODAY: 'wwht:unlockToday',
  UNLOCK_ALL: 'wwht:unlockAll',
  ZODIAC: 'wwht:zodiac',
  FIRST_OPEN_DONE: 'wwht:firstOpenDone',
  STREAK_DAYS: 'wwht:streakDays',
  STREAK_LAST_DATE: 'wwht:streakLastDate',
  // Lifecycle — 3-day free window then daily-free model
  FIRST_OPEN_DATE: 'wwht:firstOpenDate',     // YYYY-MM-DD of very first open
  DAY4_BANNER_SEEN: 'wwht:day4BannerSeen',   // user has dismissed the day-4 transition banner
  // Per-install salt for varying rule-based picks across users
  INSTALL_SALT: 'wwht:installSalt',
  // Last-seen server-side rule bucket (bumped from ops console to force re-pick)
  LAST_RULE_BUCKET: 'wwht:lastRuleBucket',
  // Last-seen engine mode ('llm' | 'rule') — used to invalidate cache when ops flips it
  LAST_ENGINE_MODE: 'wwht:lastEngineMode',
  // 30-day full unlock — purchasedAt timestamp (ms)
  UNLOCK_ALL_AT: 'wwht:unlockAllAt',
  // Push notification user preference (default true)
  PUSH_ENABLED: 'wwht:pushEnabled',
};

// 30-day full-unlock window (₹49)
const UNLOCK_ALL_DAYS = 30;
const UNLOCK_ALL_MS = UNLOCK_ALL_DAYS * 24 * 60 * 60 * 1000;

// First 3 calendar days are full-reveal for every user
const FREE_WINDOW_DAYS = 3;

const MAX_RECENT = 14; // Don't repeat predictions within 14 days

// ─────────────────────────────────────────────────────────────
// Recent prediction IDs – per category
// ─────────────────────────────────────────────────────────────

export async function getRecentIds(category) {
  try {
    const raw = await AsyncStorage.getItem(KEYS.RECENT_IDS(category));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function recordShownId(category, id) {
  try {
    const recent = await getRecentIds(category);
    const updated = [id, ...recent].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(KEYS.RECENT_IDS(category), JSON.stringify(updated));
  } catch {
    // Non-critical
  }
}

// ─────────────────────────────────────────────────────────────
// Today's prediction cache – keyed to current date
// ─────────────────────────────────────────────────────────────

export async function getCachedPredictions() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.TODAY_PREDICTIONS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.dateKey !== getTodayKey()) return null; // stale
    return parsed.predictions;
  } catch {
    return null;
  }
}

export async function cachePredictions(predictions) {
  try {
    await AsyncStorage.setItem(
      KEYS.TODAY_PREDICTIONS,
      JSON.stringify({ dateKey: getTodayKey(), predictions })
    );
  } catch {
    // Non-critical
  }
}

// ─────────────────────────────────────────────────────────────
// Unlock state
// ─────────────────────────────────────────────────────────────

/**
 * Daily unlock (₹29): tied to the current date string.
 * Resets automatically at midnight because the key includes the date.
 */
export async function getUnlockToday() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.UNLOCK_TODAY);
    if (!raw) return false;
    const { dateKey } = JSON.parse(raw);
    return dateKey === getTodayKey();
  } catch {
    return false;
  }
}

export async function setUnlockToday() {
  try {
    await AsyncStorage.setItem(
      KEYS.UNLOCK_TODAY,
      JSON.stringify({ dateKey: getTodayKey() })
    );
  } catch {
    // Non-critical
  }
}

/**
 * Full unlock (₹49): 30 days from purchase. Stored as purchasedAt ms.
 * Backwards-compat: if legacy `wwht:unlockAll === 'true'` exists, we
 * migrate it to a fresh 30-day window from now (one-time, on first read).
 */
export async function getUnlockAll() {
  const info = await getUnlockAllInfo();
  return info.active;
}

/** Returns { active, purchasedAt, expiresAt, daysRemaining } */
export async function getUnlockAllInfo() {
  try {
    const [atRaw, legacy] = await Promise.all([
      AsyncStorage.getItem(KEYS.UNLOCK_ALL_AT),
      AsyncStorage.getItem(KEYS.UNLOCK_ALL),
    ]);
    let purchasedAt = atRaw ? parseInt(atRaw, 10) : 0;
    if (!purchasedAt && legacy === 'true') {
      // One-time migration of pre-1.6 installs.
      purchasedAt = Date.now();
      await AsyncStorage.setItem(KEYS.UNLOCK_ALL_AT, String(purchasedAt));
    }
    if (!purchasedAt) {
      return { active: false, purchasedAt: 0, expiresAt: 0, daysRemaining: 0 };
    }
    const expiresAt = purchasedAt + UNLOCK_ALL_MS;
    const remainingMs = expiresAt - Date.now();
    const active = remainingMs > 0;
    const daysRemaining = active ? Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))) : 0;
    return { active, purchasedAt, expiresAt, daysRemaining };
  } catch {
    return { active: false, purchasedAt: 0, expiresAt: 0, daysRemaining: 0 };
  }
}

export async function setUnlockAll() {
  try {
    await AsyncStorage.setItem(KEYS.UNLOCK_ALL_AT, String(Date.now()));
    // Keep legacy flag for older builds reading the same store.
    await AsyncStorage.setItem(KEYS.UNLOCK_ALL, 'true');
  } catch {
    // Non-critical
  }
}

export const UNLOCK_ALL_WINDOW_DAYS = UNLOCK_ALL_DAYS;

// ─────────────────────────────────────────────────────────────
// Push notification preference
// ─────────────────────────────────────────────────────────────

export async function getPushEnabled() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PUSH_ENABLED);
    // Default = true. Only 'false' string disables.
    return raw !== 'false';
  } catch {
    return true;
  }
}

export async function setPushEnabled(enabled) {
  try {
    await AsyncStorage.setItem(KEYS.PUSH_ENABLED, enabled ? 'true' : 'false');
  } catch {
    // Non-critical
  }
}

/** Convenience: returns true if either unlock type is active today. */
export async function isUnlocked() {
  const [today, all] = await Promise.all([getUnlockToday(), getUnlockAll()]);
  return today || all;
}

// ─────────────────────────────────────────────────────────────
// Last opened date – for Daily Fresh tracking
// ─────────────────────────────────────────────────────────────

export async function setLastOpened() {
  try {
    await AsyncStorage.setItem(KEYS.LAST_OPENED, Date.now().toString());
  } catch {
    // Non-critical
  }
}

export async function isFirstOpenToday() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.LAST_OPENED);
    if (!raw) return true;
    return isYesterday(parseInt(raw, 10));
  } catch {
    return true;
  }
}

// ─────────────────────────────────────────────────────────────
// Optional zodiac preference
// ─────────────────────────────────────────────────────────────

export async function getZodiac() {
  try {
    return await AsyncStorage.getItem(KEYS.ZODIAC);
  } catch {
    return null;
  }
}

export async function setZodiac(sign) {
  try {
    await AsyncStorage.setItem(KEYS.ZODIAC, sign);
  } catch {
    // Non-critical
  }
}

// ─────────────────────────────────────────────────────────────
// First-time user — full reveal of all 4 cards on very first open
// ─────────────────────────────────────────────────────────────

/** True only on the very first launch ever. */
export async function isFirstEverOpen() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.FIRST_OPEN_DONE);
    return raw !== 'true';
  } catch {
    return false;
  }
}

/** Mark first-ever open as completed. Call after the user has seen the full preview. */
export async function markFirstOpenDone() {
  try {
    await AsyncStorage.setItem(KEYS.FIRST_OPEN_DONE, 'true');
  } catch {
    // Non-critical
  }
}

// ─────────────────────────────────────────────────────────────
// Reading streak — gamification, drives daily return
// ─────────────────────────────────────────────────────────────

/**
 * Increments streak on first open of a new calendar day.
 * Resets to 1 if more than 1 day has passed since last check-in.
 * Returns the current streak length (days).
 */
export async function bumpStreak() {
  try {
    const today = getTodayKey();
    const [daysRaw, lastDate] = await Promise.all([
      AsyncStorage.getItem(KEYS.STREAK_DAYS),
      AsyncStorage.getItem(KEYS.STREAK_LAST_DATE),
    ]);

    const currentDays = daysRaw ? parseInt(daysRaw, 10) : 0;

    if (lastDate === today) {
      return currentDays || 1;
    }

    let newDays;
    if (!lastDate) {
      newDays = 1;
    } else {
      // Check if lastDate was yesterday by parsing the date strings (YYYY-MM-DD)
      const last = new Date(lastDate);
      const now = new Date(today);
      const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));
      newDays = diffDays === 1 ? currentDays + 1 : 1;
    }

    await Promise.all([
      AsyncStorage.setItem(KEYS.STREAK_DAYS, String(newDays)),
      AsyncStorage.setItem(KEYS.STREAK_LAST_DATE, today),
    ]);
    return newDays;
  } catch {
    return 1;
  }
}

export async function getStreak() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.STREAK_DAYS);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// Lifecycle — 3-day free window then daily-free model
// Day 1, 2, 3 = all 4 cards readable. Day 4+ = 1 free per day.
// ─────────────────────────────────────────────────────────────

function dayDiff(fromYmd, toYmd) {
  // Both are YYYY-MM-DD. Difference in calendar days.
  const a = new Date(fromYmd);
  const b = new Date(toYmd);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Returns the user's day number (1-based) since first open.
 * Records first-open date on the first call ever.
 */
export async function getDayNumber() {
  try {
    const today = getTodayKey();
    let firstDate = await AsyncStorage.getItem(KEYS.FIRST_OPEN_DATE);
    if (!firstDate) {
      await AsyncStorage.setItem(KEYS.FIRST_OPEN_DATE, today);
      firstDate = today;
    }
    return Math.max(1, dayDiff(firstDate, today) + 1);
  } catch {
    return 1;
  }
}

/** True if user is still inside the 3-day free reveal window. */
export async function isInFreeWindow() {
  const day = await getDayNumber();
  return day <= FREE_WINDOW_DAYS;
}

export const FREE_WINDOW = FREE_WINDOW_DAYS;

/** Day-4 transition banner — show once when free window expires. */
export async function shouldShowDay4Banner() {
  try {
    const day = await getDayNumber();
    if (day < FREE_WINDOW_DAYS + 1) return false;
    const seen = await AsyncStorage.getItem(KEYS.DAY4_BANNER_SEEN);
    return seen !== 'true';
  } catch {
    return false;
  }
}

export async function markDay4BannerSeen() {
  try {
    await AsyncStorage.setItem(KEYS.DAY4_BANNER_SEEN, 'true');
  } catch {
    // Non-critical
  }
}

// ─────────────────────────────────────────────────────────────
// Per-install salt + server rule bucket
// Used by the rule-based engine so different users see different
// picks for the same date and so ops can force a re-pick.
// ─────────────────────────────────────────────────────────────

export async function getInstallSalt() {
  try {
    let salt = await AsyncStorage.getItem(KEYS.INSTALL_SALT);
    if (!salt) {
      // 32-bit unsigned integer as base36, plenty of variation
      salt = (Math.floor(Math.random() * 0xffffffff) >>> 0).toString(36);
      await AsyncStorage.setItem(KEYS.INSTALL_SALT, salt);
    }
    return salt;
  } catch {
    return '0';
  }
}

export async function getLastRuleBucket() {
  try {
    return (await AsyncStorage.getItem(KEYS.LAST_RULE_BUCKET)) || '0';
  } catch {
    return '0';
  }
}

export async function setLastRuleBucket(bucket) {
  try {
    await AsyncStorage.setItem(KEYS.LAST_RULE_BUCKET, String(bucket || '0'));
  } catch {
    // Non-critical
  }
}

export async function getLastEngineMode() {
  try {
    return (await AsyncStorage.getItem(KEYS.LAST_ENGINE_MODE)) || 'llm';
  } catch {
    return 'llm';
  }
}

export async function setLastEngineMode(mode) {
  try {
    await AsyncStorage.setItem(KEYS.LAST_ENGINE_MODE, mode === 'rule' ? 'rule' : 'llm');
  } catch {
    // Non-critical
  }
}

/** Clear the local cached predictions so the engine repicks. */
export async function clearCachedPredictions() {
  try {
    await AsyncStorage.removeItem(KEYS.TODAY_PREDICTIONS);
  } catch {
    // Non-critical
  }
}
