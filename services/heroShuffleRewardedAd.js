import { showRewardedAd } from '@/services/rewardedAdService';

const HERO_PLACEMENT = 'hero_shuffle';

export function showHeroShuffleRewardedAd({ metadata } = {}) {
  return showRewardedAd({
    placement: HERO_PLACEMENT,
    metadata,
  });
}
