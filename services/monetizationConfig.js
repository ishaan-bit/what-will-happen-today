export const DEFAULT_MONETIZATION_CONFIG = {
  freeSignalsPerDay: 1,
  lockedSignalsPerDay: 3,
  maxHeroShufflesPerDay: 4,
  maxRewardedShufflesPerDay: 4,
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
  'maxRewardedShufflesPerDay',
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
  const normalizedInput = {
    ...(input || {}),
    maxHeroShufflesPerDay: input?.maxRewardedShufflesPerDay ?? input?.maxHeroShufflesPerDay,
  };
  NUMBER_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(normalizedInput, key)) {
      const fallback = DEFAULT_MONETIZATION_CONFIG[key] ?? DEFAULT_MONETIZATION_CONFIG.maxHeroShufflesPerDay;
      out[key] = clampInt(normalizedInput[key], fallback, 0, Number.MAX_SAFE_INTEGER);
    }
  });
  BOOLEAN_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input || {}, key)) {
      out[key] = input[key] !== false;
    }
  });
  if (out.maxHeroImagesPerDay < 1) out.maxHeroImagesPerDay = 1;
  out.maxRewardedShufflesPerDay = out.maxHeroShufflesPerDay;
  return out;
}

export function mergeMonetizationConfig(remote = null, poolConfig = null) {
  return normalizeMonetizationConfig({
    ...(remote || {}),
    ...(poolConfig || {}),
  });
}
