export const DEFAULT_MONETIZATION_CONFIG = {
  freeSignalsPerDay: 1,
  lockedSignalsPerDay: 3,
  maxHeroShufflesPerDay: 4,
  maxHeroImagesPerDay: 5,
  deeperMeaningEnabled: true,
  rewardedAdsEnabled: true,
  todayUnlockEnabled: true,
  thirtyDayUnlockEnabled: true,
  fallbackHeroEnabled: true,
};

const NUMBER_KEYS = new Set([
  'freeSignalsPerDay',
  'lockedSignalsPerDay',
  'maxHeroShufflesPerDay',
  'maxHeroImagesPerDay',
]);

const BOOLEAN_KEYS = new Set([
  'deeperMeaningEnabled',
  'rewardedAdsEnabled',
  'todayUnlockEnabled',
  'thirtyDayUnlockEnabled',
  'fallbackHeroEnabled',
]);

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeMonetizationConfig(input = {}) {
  const out = { ...DEFAULT_MONETIZATION_CONFIG };

  for (const key of NUMBER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      out[key] = clampInt(input[key], DEFAULT_MONETIZATION_CONFIG[key], 0, Number.MAX_SAFE_INTEGER);
    }
  }

  for (const key of BOOLEAN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      out[key] = input[key] !== false;
    }
  }

  if (out.maxHeroImagesPerDay < 1) out.maxHeroImagesPerDay = 1;

  return out;
}

export function mergeMonetizationConfig(remote = null, poolConfig = null) {
  return normalizeMonetizationConfig({
    ...(remote || {}),
    ...(poolConfig || {}),
  });
}
