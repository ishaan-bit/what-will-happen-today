import { showRewardedAd, getRewardedAdUnitId, getRewardedAdStatus, preloadRewardedAd } from '@/services/rewardedAdService';

const HERO_PLACEMENT = 'hero_shuffle';

/**
 * Preload the hero shuffle rewarded ad for the next shuffle attempt.
 * Call on screen mount and after every ad closes/fails/rewards.
 */
export async function preloadHeroShuffleRewardedAd(options = {}) {
  try {
    const unitId = getRewardedAdUnitId(HERO_PLACEMENT) || '';
    console.log('[hero-shuffle:preload] started', {
      placement: HERO_PLACEMENT,
      unitIdSuffix: unitId ? unitId.split('/').pop() : '[missing]',
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
  return getRewardedAdStatus(HERO_PLACEMENT);
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
 *   - 'ad_still_loading': Ad is loading, not yet ready to show. Caller should show "Ad still loading" message.
 *   - 'load_timeout': Ad took >12 seconds to load
 *   - 'ad_closed_before_reward': User closed ad before earning reward
 *   - 'load_error', 'show_error': SDK or network error
 *   - 'missing_ad_unit_id', 'ad_sdk_unavailable': Configuration issue
 */
export async function showHeroShuffleRewardedAd({ metadata } = {}) {
  try {
    const unitId = getRewardedAdUnitId(HERO_PLACEMENT) || '';
    console.log('[hero-shuffle:show] requested', {
      placement: HERO_PLACEMENT,
      unitIdSuffix: unitId ? unitId.split('/').pop() : '[missing]',
    });
  } catch (err) {
    console.log('[hero-shuffle:show] diagnostic failed', { message: err?.message || null });
  }

  // Use the same helper/lifecycle as locked-signal: call `showRewardedAd` directly
  // This avoids the early 'ad_still_loading' short-circuit and matches the working flow.
  const result = await showRewardedAd({ placement: HERO_PLACEMENT, metadata });

  console.log('[hero-shuffle:show] result', {
    rewarded: result.rewarded,
    reason: result.reason,
    ok: result.ok,
  });

  // After ad completes (success or failure), preload the next one for immediate readiness
  try {
    preloadHeroShuffleRewardedAd({ forceFresh: true }).catch(() => null);
  } catch (err) {
    console.log('[hero-shuffle:show] failed to preload next ad', { message: err?.message || null });
  }

  return result;
}
