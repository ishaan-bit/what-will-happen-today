export const DEFAULT_MONETIZATION_CONFIG = {
  freeSignalsPerDay: 1,
  lockedSignalsPerDay: 3,
  maxHeroShufflesPerDay: 3,
  maxRewardedShufflesPerDay: 3,
  maxHeroImagesPerDay: 4,
  deeperMeaningEnabled: true,
  rewardedAdsEnabled: true,
  todayUnlockEnabled: true,
  thirtyDayUnlockEnabled: true,
  fallbackHeroEnabled: true,
  // WWHT 2.0 — 4-card tarot model
  cardBasedModel: true,   // false = ops kill-switch back to the legacy signal list
  bannerAdEnabled: true,  // banner is the only ad we keep
  freeCardRotates: true,  // the free card's life-area rotates daily
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
  'cardBasedModel',
  'bannerAdEnabled',
  'freeCardRotates',
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
