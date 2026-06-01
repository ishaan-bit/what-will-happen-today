import {
  showRewardedAd,
  getRewardedAdUnitId,
  getRewardedAdStatus,
  preloadRewardedAd,
  isHeroRewardedTestOverrideEnabled,
} from '@/services/rewardedAdService';

const HERO_PLACEMENT = 'hero_shuffle';
const HERO_FALLBACK_PLACEMENT = 'hero_shuffle_fallback';
const RETRY_DELAYS_MS = [15000, 30000];
let retryTimer = null;
let retryAttempt = 0;

function adUnitSuffix(unitId) {
  return typeof unitId === 'string' && unitId.trim()
    ? unitId.trim().split('/').pop()
    : '[missing]';
}

function isLoadFailure(reason) {
  return [
    'load_error',
    'failed_to_load',
    'load_timeout',
    'ad_unavailable',
    'ad_not_ready',
    'failed',
  ].includes(reason);
}

function schedulePrimaryRetry() {
  if (retryTimer) return;
  const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
  retryAttempt += 1;
  console.log('[hero-shuffle:preload] retry scheduled', { delayMs: delay });
  retryTimer = setTimeout(() => {
    retryTimer = null;
    preloadHeroShuffleRewardedAd({ forceFresh: true }).catch(() => null);
  }, delay);
}

/**
 * Preload the hero shuffle rewarded ad for the next shuffle attempt.
 * Call on screen mount and after every ad closes/fails/rewards.
 */
export async function preloadHeroShuffleRewardedAd(options = {}) {
  try {
    const unitId = getRewardedAdUnitId(HERO_PLACEMENT) || '';
    console.log('[hero-shuffle:preload] started', {
      placement: HERO_PLACEMENT,
      unitIdSuffix: adUnitSuffix(unitId),
    });

    const status = await preloadRewardedAd({
      placement: HERO_PLACEMENT,
      forceFresh: options.forceFresh || false,
    });

    console.log('[hero-shuffle:preload] result', {
      loaded: status.loaded,
      loading: status.loading,
      phase: status.phase,
      error: status.error,
    });

    if (status.loaded) {
      retryAttempt = 0;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    } else if (status.phase === 'failed' || status.phase === 'unavailable') {
      schedulePrimaryRetry();
    }

    return status;
  } catch (err) {
    console.log('[hero-shuffle:preload] error', { message: err?.message || null });
    return null;
  }
}

/**
 * Get the current preload status of the hero shuffle ad.
 */
export function getHeroShuffleAdStatus() {
  const primary = getRewardedAdStatus(HERO_PLACEMENT);
  const fallback = getRewardedAdStatus(HERO_FALLBACK_PLACEMENT);
  return {
    ...primary,
    primary,
    fallback,
    fallbackUnitIdSuffix: fallback?.unitIdSuffix || null,
  };
}

/**
 * Show a fresh rewarded ad for hero shuffle.
 * Creates a new per-attempt instance with fresh listeners and 12-second load timeout.
 * Returns { ok, rewarded, reason, placement, isLoading, ... }
 *
 * On success (EARNED_REWARD):
 *   { ok: true, rewarded: true, ... } — caller should shuffle hero
 *
 * On failure (timeout, load error, user closes early, ad unavailable):
 *   { ok: false, rewarded: false, reason, isLoading, ... } — caller should NOT shuffle, NOT decrement count
 *
 * Reasons:
 *   - 'ad_loading', 'ad_not_ready': Ad is not ready to show.
 *   - 'load_timeout': Ad took >12 seconds to load
 *   - 'ad_closed_before_reward': User closed ad before earning reward
 *   - 'load_error', 'show_error': SDK or network error
 *   - 'missing_ad_unit_id', 'ad_sdk_unavailable': Configuration issue
 */
export async function showHeroShuffleRewardedAd({ metadata } = {}) {
  const primaryStatus = getRewardedAdStatus(HERO_PLACEMENT);
  try {
    const unitId = getRewardedAdUnitId(HERO_PLACEMENT) || '';
    console.log('[hero-shuffle:show] requested', {
      placement: HERO_PLACEMENT,
      unitIdSuffix: adUnitSuffix(unitId),
      phase: primaryStatus?.phase || primaryStatus?.state || null,
    });
  } catch (err) {
    console.log('[hero-shuffle:show] diagnostic failed', { message: err?.message || null });
  }

  if (primaryStatus?.loading || primaryStatus?.phase === 'loading') {
    return {
      ok: false,
      rewarded: false,
      reason: 'ad_loading',
      isLoading: true,
      placement: HERO_PLACEMENT,
    };
  }

  const result = await showRewardedAd({
    placement: HERO_PLACEMENT,
    metadata,
    preferLoaded: true,
    requireLoaded: true,
  });

  console.log('[hero-shuffle:show] result', {
    rewarded: result.rewarded,
    reason: result.reason,
    ok: result.ok,
    unitIdSuffix: adUnitSuffix(result.adUnitId),
  });

  if (!result.rewarded && !isHeroRewardedTestOverrideEnabled() && isLoadFailure(result.reason)) {
    schedulePrimaryRetry();
    const fallbackUnitId = getRewardedAdUnitId(HERO_FALLBACK_PLACEMENT) || '';
    console.log('[hero-shuffle:fallback] requested', {
      primaryReason: result.reason,
      primaryUnitSuffix: adUnitSuffix(result.adUnitId || getRewardedAdUnitId(HERO_PLACEMENT)),
      fallbackUnitSuffix: adUnitSuffix(fallbackUnitId),
    });
    const fallbackResult = await showRewardedAd({
      placement: HERO_FALLBACK_PLACEMENT,
      metadata: { ...(metadata || {}), primaryReason: result.reason },
      preferLoaded: true,
      requireLoaded: false,
    });
    console.log('[hero-shuffle:fallback] result', {
      rewarded: fallbackResult.rewarded,
      reason: fallbackResult.reason,
      ok: fallbackResult.ok,
      fallbackUnitSuffix: adUnitSuffix(fallbackResult.adUnitId || fallbackUnitId),
    });
    if (fallbackResult.rewarded) {
      return {
        ...fallbackResult,
        placement: HERO_PLACEMENT,
        source: 'admob_fallback',
        primaryReason: result.reason,
        fallbackPlacement: HERO_FALLBACK_PLACEMENT,
      };
    }
    return {
      ...fallbackResult,
      placement: HERO_PLACEMENT,
      primaryReason: result.reason,
      fallbackPlacement: HERO_FALLBACK_PLACEMENT,
      reason: isLoadFailure(fallbackResult.reason) ? 'load_error' : fallbackResult.reason,
    };
  }

  // After ad completes (success or failure), preload the next one for immediate readiness
  try {
    preloadHeroShuffleRewardedAd({ forceFresh: true }).catch(() => null);
  } catch (err) {
    console.log('[hero-shuffle:show] failed to preload next ad', { message: err?.message || null });
  }

  return result;
}
