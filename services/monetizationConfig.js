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

const NUMBER_KEYS = [
  'freeSignalsPerDay',
  'lockedSignalsPerDay',
  'maxHeroShufflesPerDay',
  'maxHeroImagesPerDay',
];

const BOOLEAN_KEYS = [
  'deeperMeaningEnabled',
  'rewardedAdsEnabled',
  'todayUnlockEnabled',
  'thirtyDayUnlockEnabled',
  'fallbackHeroEnabled',
];

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeMonetizationConfig(input = {}) {
  const out = { ...DEFAULT_MONETIZATION_CONFIG };
  NUMBER_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input || {}, key)) {
      out[key] = clampInt(input[key], DEFAULT_MONETIZATION_CONFIG[key], 0, Number.MAX_SAFE_INTEGER);
    }
  });
  BOOLEAN_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input || {}, key)) {
      out[key] = input[key] !== false;
    }
  });
  if (out.maxHeroImagesPerDay < 1) out.maxHeroImagesPerDay = 1;
  return out;
}

export function mergeMonetizationConfig(remote = null, poolConfig = null) {
  return normalizeMonetizationConfig({
    ...(remote || {}),
    ...(poolConfig || {}),
  });
}
