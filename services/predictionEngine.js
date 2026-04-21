/**
 * Prediction Engine
 *
 * Layer 1: Rule-based, deterministic, instant.
 * Takes a date seed + category offset → deterministic daily pick.
 * Avoids recently shown predictions using AsyncStorage history.
 *
 * Layer 2 hook: fetchRemotePredictions() for LLM-enhanced batch.
 * Falls back to local content if remote is unavailable.
 */

import { love } from '@/content/love';
import { career } from '@/content/career';
import { money } from '@/content/money';
import { mood } from '@/content/mood';
import { getDailySeed, seededRandom } from '@/utils/dateUtils';
import {
  getRecentIds,
  recordShownId,
  getCachedPredictions,
  cachePredictions,
} from '@/services/storageService';

const POOLS = { love, career, money, mood };

// Category offsets ensure different categories never pick the same index
const CATEGORY_OFFSETS = {
  love: 0,
  career: 1000,
  money: 2000,
  mood: 3000,
};

/**
 * Picks a prediction for a single category using daily seed.
 * Filters out recently shown IDs for variety.
 */
async function pickForCategory(category) {
  const pool = POOLS[category];
  if (!pool || pool.length === 0) return null;

  const recentIds = await getRecentIds(category);
  const available = pool.filter((p) => !recentIds.includes(p.id));
  const source = available.length > 0 ? available : pool; // fallback: full pool

  const seed = getDailySeed() + CATEGORY_OFFSETS[category];
  const index = Math.floor(seededRandom(seed) * source.length);
  const prediction = source[index];

  await recordShownId(category, prediction.id);
  return prediction;
}

/**
 * Returns today's predictions for all four categories.
 * Uses cache if available for the current date; otherwise generates fresh.
 */
export async function getTodaysPredictions() {
  // Check cache first (re-use within same day)
  const cached = await getCachedPredictions();
  if (cached) return cached;

  // Generate fresh
  const [lovePred, careerPred, moneyPred, moodPred] = await Promise.all([
    pickForCategory('love'),
    pickForCategory('career'),
    pickForCategory('money'),
    pickForCategory('mood'),
  ]);

  const predictions = {
    love: lovePred,
    career: careerPred,
    money: moneyPred,
    mood: moodPred,
  };

  await cachePredictions(predictions);
  return predictions;
}

// ─────────────────────────────────────────────────────────────
// Layer 2: Remote LLM-enhanced predictions (optional)
// Falls back to local if fetch fails or is unavailable.
// ─────────────────────────────────────────────────────────────

const REMOTE_TIMEOUT_MS = 4000;

/**
 * Attempts to fetch LLM-enhanced predictions from backend.
 * On failure, returns null so the engine falls back to local pool.
 */
export async function fetchRemotePredictions() {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

    const response = await fetch(`${apiUrl}/api/predictions/daily`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const json = await response.json();
    return json?.data ?? json ?? null;
  } catch {
    return null;
  }
}

/**
 * Main entry: tries remote first, merges over local picks.
 * Remote predictions override local ones for any category they include.
 */
export async function getPredictions() {
  const [local, remote] = await Promise.all([
    getTodaysPredictions(),
    fetchRemotePredictions(),
  ]);

  if (!remote) return local;

  // Merge: remote wins per-category if it provides the field
  return {
    love: remote.love ?? local.love,
    career: remote.career ?? local.career,
    money: remote.money ?? local.money,
    mood: remote.mood ?? local.mood,
  };
}
