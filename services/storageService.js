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
};

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
 * Full unlock (₹49): permanent until uninstall.
 */
export async function getUnlockAll() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.UNLOCK_ALL);
    return raw === 'true';
  } catch {
    return false;
  }
}

export async function setUnlockAll() {
  try {
    await AsyncStorage.setItem(KEYS.UNLOCK_ALL, 'true');
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
