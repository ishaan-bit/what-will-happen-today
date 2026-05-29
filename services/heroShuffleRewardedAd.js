import { showRewardedAd, getRewardedAdUnitId } from '@/services/rewardedAdService';

const HERO_PLACEMENT = 'hero_shuffle';

/**
 * Show a fresh rewarded ad for hero shuffle.
 * Creates a new per-attempt instance with fresh listeners and 12-second load timeout.
 * Returns { ok, rewarded, reason, placement, ... }
 *
 * On success (EARNED_REWARD):
 *   { ok: true, rewarded: true, ... } — caller should shuffle hero
 *
 * On failure (timeout, load error, user closes early, ad unavailable):
 *   { ok: false, rewarded: false, reason, ... } — caller should NOT shuffle, NOT decrement count
 *
 * Reasons:
 *   - 'load_timeout': Ad took >12 seconds to load
 *   - 'ad_closed_before_reward': User closed ad before earning reward
 *   - 'load_error', 'show_error': SDK or network error
 *   - 'missing_ad_unit_id', 'ad_sdk_unavailable': Configuration issue
 */
export async function showHeroShuffleRewardedAd({ metadata } = {}) {
  try {
    const unitId = getRewardedAdUnitId(HERO_PLACEMENT) || '';
    // Log safe diagnostic: only suffix of unit id
    console.log('[hero-shuffle] showHeroShuffleRewardedAd requested', {
      placement: HERO_PLACEMENT,
      unitIdSuffix: unitId ? unitId.split('/').pop() : null,
      envPresent: !!unitId,
    });
  } catch (err) {
    console.log('[hero-shuffle] showHeroShuffleRewardedAd diagnostic failed', { message: err?.message || null });
  }

  return showRewardedAd({
    placement: HERO_PLACEMENT,
    metadata,
    preferLoaded: false,
    requireLoaded: false,
  });
}
