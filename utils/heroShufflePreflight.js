const HERO_SHUFFLE_MESSAGES = {
  daily_shuffle_limit_reached: "You've seen all today's reader shuffles.",
  no_next_hero_available: 'No other reader available right now.',
  empty_or_invalid_hero_pool: 'No other reader available right now.',
  stale_current_hero_id: 'No other reader available right now.',
  invalid_shuffle_config: 'Reader shuffle config is updating. Try again soon.',
  ad_not_loaded_yet: 'Ad is still loading. Try again in a few seconds.',
  ad_load_error_or_no_fill: 'No ad available right now. Try again soon.',
  reward_not_earned: 'No reward was granted. The reader did not change.',
  hero_change_failed_after_reward: 'Reward received, but reader change failed. Try again.',
  ok: null,
};

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function heroId(hero) {
  return hero?.id ? String(hero.id) : null;
}

function normalizeAdReason(status = {}) {
  const phase = status.phase || status.state || null;
  if (status.loaded) return null;
  if (status.loading || phase === 'loading') return 'ad_not_loaded_yet';
  if (status.error || status.reason || ['failed', 'unavailable'].includes(phase)) return 'ad_load_error_or_no_fill';
  return 'ad_not_loaded_yet';
}

function buildResult(reason, patch = {}) {
  return {
    ok: reason === 'ok',
    reason,
    didAttemptAdShow: false,
    nextHeroId: null,
    normalizedCurrentHeroId: null,
    userMessage: HERO_SHUFFLE_MESSAGES[reason] || null,
    ...patch,
  };
}

export function heroShuffleMessageForReason(reason) {
  return HERO_SHUFFLE_MESSAGES[reason] || HERO_SHUFFLE_MESSAGES.ad_load_error_or_no_fill;
}

export function evaluateHeroShufflePreflight(input = {}) {
  const heroImages = Array.isArray(input.heroImages) ? input.heroImages.filter(Boolean) : [];
  const maxRewardedShufflesPerDay = positiveInteger(input.maxRewardedShufflesPerDay);
  const maxHeroImagesPerDay = positiveInteger(input.maxHeroImagesPerDay);
  const localHeroShuffleCount = Math.max(0, Number(input.localHeroShuffleCount) || 0);
  const defaultHeroId = input.defaultHeroId ? String(input.defaultHeroId) : heroId(heroImages[0]);
  const currentHeroId = input.currentHeroId ? String(input.currentHeroId) : defaultHeroId;
  const activeIds = new Set(heroImages.map(heroId).filter(Boolean));
  const activeSeenIds = (Array.isArray(input.seenHeroIds) ? input.seenHeroIds : [])
    .map((id) => String(id))
    .filter((id) => activeIds.has(id));

  if (!maxRewardedShufflesPerDay || !maxHeroImagesPerDay) {
    return buildResult('invalid_shuffle_config', { normalizedCurrentHeroId: currentHeroId || null });
  }

  if (heroImages.length < 1 || activeIds.size < 1) {
    return buildResult('empty_or_invalid_hero_pool', { normalizedCurrentHeroId: currentHeroId || null });
  }

  let normalizedCurrentHeroId = currentHeroId;
  let staleCurrentHeroId = false;
  if (!normalizedCurrentHeroId || !activeIds.has(normalizedCurrentHeroId)) {
    normalizedCurrentHeroId = activeIds.has(defaultHeroId) ? defaultHeroId : heroId(heroImages[0]);
    staleCurrentHeroId = true;
  }

  if (heroImages.length < 2 || activeIds.size < 2) {
    return buildResult('no_next_hero_available', { normalizedCurrentHeroId });
  }

  if (localHeroShuffleCount >= maxRewardedShufflesPerDay || activeSeenIds.length >= maxHeroImagesPerDay) {
    return buildResult('daily_shuffle_limit_reached', { normalizedCurrentHeroId });
  }

  const seen = new Set(activeSeenIds);
  const nextHero = heroImages.find((hero) => {
    const id = heroId(hero);
    return id && id !== normalizedCurrentHeroId && !seen.has(id);
  }) || heroImages.find((hero) => {
    const id = heroId(hero);
    return id && id !== normalizedCurrentHeroId;
  }) || null;

  if (!nextHero) {
    return buildResult(staleCurrentHeroId ? 'stale_current_hero_id' : 'no_next_hero_available', {
      normalizedCurrentHeroId,
    });
  }

  const adReason = normalizeAdReason(input.rewardedAdStatus || {});
  if (adReason) {
    return buildResult(adReason, {
      normalizedCurrentHeroId,
      nextHeroId: heroId(nextHero),
    });
  }

  return buildResult('ok', {
    didAttemptAdShow: true,
    normalizedCurrentHeroId,
    nextHeroId: heroId(nextHero),
    userMessage: null,
  });
}

export const HERO_SHUFFLE_REASON_MESSAGES = HERO_SHUFFLE_MESSAGES;
