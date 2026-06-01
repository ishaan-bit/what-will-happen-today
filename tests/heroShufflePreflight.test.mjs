import assert from 'node:assert/strict';
import {
  evaluateHeroShufflePreflight,
  heroShuffleMessageForReason,
} from '../utils/heroShufflePreflight.js';

const heroes = [
  { id: 'reader-1' },
  { id: 'reader-2' },
  { id: 'reader-3' },
  { id: 'reader-4' },
  { id: 'reader-5' },
  { id: 'reader-6' },
];

function preflight(overrides = {}) {
  return evaluateHeroShufflePreflight({
    heroImages: heroes.slice(0, 3),
    currentHeroId: 'reader-1',
    defaultHeroId: 'reader-1',
    seenHeroIds: ['reader-1'],
    maxRewardedShufflesPerDay: 4,
    maxHeroImagesPerDay: 5,
    localHeroShuffleCount: 0,
    rewardedAdStatus: { loaded: true, loading: false, phase: 'loaded' },
    ...overrides,
  });
}

function assertNoGenericMessage(result) {
  assert.notEqual(result.userMessage, 'Ad unavailable');
  assert.notEqual(result.userMessage, 'The reader image did not change. Try again in a moment.');
  assert.notEqual(result.userMessage, 'Try again in a moment.');
}

assert.deepEqual(
  preflight(),
  {
    ok: true,
    reason: 'ok',
    didAttemptAdShow: true,
    nextHeroId: 'reader-2',
    normalizedCurrentHeroId: 'reader-1',
    userMessage: null,
  },
);

assert.equal(preflight({ localHeroShuffleCount: 3 }).reason, 'ok');
assert.equal(preflight({ localHeroShuffleCount: 4 }).reason, 'daily_shuffle_limit_reached');
assert.equal(preflight({ localHeroShuffleCount: 40 }).reason, 'daily_shuffle_limit_reached');

assert.equal(
  preflight({ maxRewardedShufflesPerDay: 7, localHeroShuffleCount: 6 }).reason,
  'ok',
);
assert.equal(
  preflight({ maxRewardedShufflesPerDay: 7, localHeroShuffleCount: 7 }).reason,
  'daily_shuffle_limit_reached',
);
assert.equal(
  preflight({ maxRewardedShufflesPerDay: 23, localHeroShuffleCount: 22 }).reason,
  'ok',
);

assert.equal(
  preflight({ maxRewardedShufflesPerDay: 0 }).reason,
  'invalid_shuffle_config',
);
assert.equal(
  preflight({ maxHeroImagesPerDay: Number.NaN }).reason,
  'invalid_shuffle_config',
);

assert.equal(
  preflight({ heroImages: heroes.slice(0, 1) }).reason,
  'no_next_hero_available',
);
assert.equal(
  preflight({ heroImages: [] }).reason,
  'empty_or_invalid_hero_pool',
);

const stale = preflight({
  heroImages: heroes.slice(0, 3),
  currentHeroId: 'deleted-reader',
  defaultHeroId: 'reader-1',
  seenHeroIds: ['deleted-reader'],
});
assert.equal(stale.reason, 'ok');
assert.equal(stale.normalizedCurrentHeroId, 'reader-1');
assert.equal(stale.nextHeroId, 'reader-2');

assert.equal(
  preflight({ rewardedAdStatus: { loaded: false, loading: true, phase: 'loading' } }).reason,
  'ad_not_loaded_yet',
);
assert.equal(
  preflight({ rewardedAdStatus: { loaded: false, loading: false, phase: 'failed', reason: 'load_error' } }).reason,
  'ad_load_error_or_no_fill',
);

for (const reason of [
  'daily_shuffle_limit_reached',
  'no_next_hero_available',
  'empty_or_invalid_hero_pool',
  'invalid_shuffle_config',
  'ad_not_loaded_yet',
  'ad_load_error_or_no_fill',
  'reward_not_earned',
  'hero_change_failed_after_reward',
]) {
  assertNoGenericMessage({ userMessage: heroShuffleMessageForReason(reason) });
}

function runFakeRewardedFlow({ max = 3, attempts = 3, reward = true, heroCount = 4 }) {
  let currentHeroId = 'reader-1';
  let seenHeroIds = ['reader-1'];
  let count = 0;
  let reloads = 0;
  let adAttempts = 0;

  for (let i = 0; i < attempts; i += 1) {
    const result = evaluateHeroShufflePreflight({
      heroImages: heroes.slice(0, heroCount),
      currentHeroId,
      defaultHeroId: 'reader-1',
      seenHeroIds,
      maxRewardedShufflesPerDay: max,
      maxHeroImagesPerDay: heroCount,
      localHeroShuffleCount: count,
      rewardedAdStatus: { loaded: true, loading: false, phase: 'loaded' },
    });
    if (!result.ok) return { count, currentHeroId, reloads, adAttempts, reason: result.reason };
    adAttempts += 1;
    reloads += 1;
    if (!reward) continue;
    currentHeroId = result.nextHeroId;
    if (!seenHeroIds.includes(currentHeroId)) seenHeroIds = [...seenHeroIds, currentHeroId];
    count += 1;
  }
  return { count, currentHeroId, reloads, adAttempts, reason: 'ok' };
}

assert.deepEqual(runFakeRewardedFlow({ max: 3, attempts: 2 }), {
  count: 2,
  currentHeroId: 'reader-3',
  reloads: 2,
  adAttempts: 2,
  reason: 'ok',
});
assert.equal(runFakeRewardedFlow({ max: 2, attempts: 3 }).reason, 'daily_shuffle_limit_reached');
assert.equal(runFakeRewardedFlow({ attempts: 2, reward: false }).count, 0);
assert.equal(runFakeRewardedFlow({ attempts: 2, reward: false }).currentHeroId, 'reader-1');
assert.deepEqual(runFakeRewardedFlow({ heroCount: 1, attempts: 1 }), {
  count: 0,
  currentHeroId: 'reader-1',
  reloads: 0,
  adAttempts: 0,
  reason: 'no_next_hero_available',
});

console.log('hero shuffle preflight tests passed');
