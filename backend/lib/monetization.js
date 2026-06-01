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

const NUMBER_KEYS = new Set([
  'freeSignalsPerDay',
  'lockedSignalsPerDay',
  'maxHeroShufflesPerDay',
  'maxRewardedShufflesPerDay',
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
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function requirePositiveInteger(value, name) {
  const raw = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${name}_must_be_positive_integer`);
  }
  return Number(raw);
}

export function normalizeMonetizationConfig(input = {}) {
  const out = { ...DEFAULT_MONETIZATION_CONFIG };
  const normalizedInput = {
    ...(input || {}),
    maxHeroShufflesPerDay: input?.maxRewardedShufflesPerDay ?? input?.maxHeroShufflesPerDay,
  };

  for (const key of NUMBER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(normalizedInput, key)) {
      const fallback = DEFAULT_MONETIZATION_CONFIG[key] ?? DEFAULT_MONETIZATION_CONFIG.maxHeroShufflesPerDay;
      out[key] = clampInt(normalizedInput[key], fallback, 0, Number.MAX_SAFE_INTEGER);
    }
  }

  for (const key of BOOLEAN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      out[key] = input[key] !== false;
    }
  }

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
