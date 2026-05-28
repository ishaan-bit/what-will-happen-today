import { Platform } from 'react-native';
import { track, Events } from '@/services/analyticsService';

const MOCK_DELAY_MS = 850;
const LOAD_TIMEOUT_MS = 12000;
const SHOW_TIMEOUT_MS = 90000;
const REWARD_CLOSE_GRACE_MS = 750;
const TEST_REWARDED_UNIT_IDS = {
  android: 'ca-app-pub-3940256099942544/5224354917',
  ios: 'ca-app-pub-3940256099942544/1712485313',
};
const preloadedAds = new Map();

function mockAdsEnabled() {
  return process.env.EXPO_PUBLIC_REWARDED_AD_MOCK === 'true';
}

function nativeAdTestModeEnabled() {
  return process.env.EXPO_PUBLIC_ADMOB_TEST_MODE === 'true'
    || (typeof __DEV__ !== 'undefined' && __DEV__);
}

function platformRewardedUnitId() {
  if (!nativeAdTestModeEnabled()) return '';
  return TEST_REWARDED_UNIT_IDS[Platform.OS] || TEST_REWARDED_UNIT_IDS.android;
}

export function getRewardedAdUnitId(placement) {
  const testUnitId = platformRewardedUnitId();
  if (testUnitId) return testUnitId;

  if (placement === 'hero_shuffle') {
    return (Platform.OS === 'android'
      ? process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_HERO_UNIT_ID
      : process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_HERO_UNIT_ID)
      || process.env.EXPO_PUBLIC_ADMOB_REWARDED_HERO_UNIT_ID
      || '';
  }
  if (placement === 'deeper_meaning') {
    return process.env.EXPO_PUBLIC_ADMOB_REWARDED_DEEPER_UNIT_ID
      || process.env.EXPO_PUBLIC_ADMOB_REWARDED_SIGNAL_UNIT_ID
      || '';
  }
  return process.env.EXPO_PUBLIC_ADMOB_REWARDED_SIGNAL_UNIT_ID || '';
}

function adProps(placement, extra = {}) {
  return {
    ad_placement: placement || 'unknown',
    platform: Platform.OS,
    ...extra,
  };
}

function loadGoogleMobileAds() {
  try {
    // Required dynamically so Expo Go / web-like tooling can fail safely.
    return require('react-native-google-mobile-ads');
  } catch {
    return null;
  }
}

function cleanup(unsubs) {
  unsubs.forEach((unsubscribe) => {
    try { unsubscribe?.(); } catch {}
  });
}

function logAdDebug(label, data = {}) {
  const shouldLog = data?.placement === 'hero_shuffle'
    || process.env.EXPO_PUBLIC_ADMOB_DEBUG === 'true'
    || (typeof __DEV__ !== 'undefined' && __DEV__);
  if (shouldLog) {
    console.log(`[rewarded:${label}]`, {
      ...data,
      unitIdPresent: data.unitIdPresent ?? undefined,
    });
  }
}

async function getNativeAds(placement) {
  const unitId = getRewardedAdUnitId(placement);
  logAdDebug('unit_id_check', { placement, unitIdPresent: !!unitId, testMode: nativeAdTestModeEnabled() });
  if (!unitId) return { error: 'missing_ad_unit_id', unitId: '' };

  const ads = loadGoogleMobileAds();
  if (!ads?.RewardedAd || !ads?.RewardedAdEventType || !ads?.AdEventType) {
    return { error: 'ad_sdk_unavailable', unitId };
  }

  const mobileAds = ads.default || ads.mobileAds;
  try {
    await mobileAds?.().initialize?.();
  } catch {
    // Initialization failures are reported by load/show events below.
  }

  return { ads, unitId };
}

export function getRewardedAdStatus(placement = 'locked_signal') {
  if (mockAdsEnabled()) return { loaded: true, loading: false, showing: false, phase: 'ready', reason: 'mock' };
  const state = preloadedAds.get(placement);
  return {
    loaded: !!state?.loaded,
    loading: !!state?.loading,
    showing: !!state?.showing,
    phase: state?.phase || 'idle',
    error: state?.error || null,
    reason: state?.reason || null,
  };
}

export async function preloadRewardedAd({ placement = 'locked_signal' } = {}) {
  if (mockAdsEnabled()) return getRewardedAdStatus(placement);
  const existing = preloadedAds.get(placement);
  if (existing?.loaded || existing?.loading) return getRewardedAdStatus(placement);

  const native = await getNativeAds(placement);
  if (native.error) {
    preloadedAds.set(placement, { loaded: false, loading: false, reason: native.error });
    return getRewardedAdStatus(placement);
  }

  const { RewardedAd, RewardedAdEventType, AdEventType } = native.ads;
  const unsubs = [];
  const state = {
    ad: null,
    unitId: native.unitId,
    phase: 'loading',
    loaded: false,
    loading: true,
    showing: false,
    unsubs,
    loadTimer: null,
    reason: null,
    error: null,
  };

  try {
    state.ad = RewardedAd.createForAdRequest(native.unitId, {
      requestNonPersonalizedAdsOnly: true,
    });
  } catch (err) {
    preloadedAds.set(placement, {
      loaded: false,
      loading: false,
      reason: 'ad_sdk_create_failed',
      error: err,
    });
    return getRewardedAdStatus(placement);
  }

  unsubs.push(state.ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
    clearTimeout(state.loadTimer);
    state.loaded = true;
    state.loading = false;
    state.phase = 'ready';
    state.reason = null;
    track(Events.REWARDED_AD_LOADED, adProps(placement, { source: 'preload' }));
    logAdDebug('loaded', { placement });
  }));

  unsubs.push(state.ad.addAdEventListener(AdEventType.ERROR, (error) => {
    clearTimeout(state.loadTimer);
    state.loaded = false;
    state.loading = false;
    state.phase = 'failed';
    state.reason = 'load_error';
    state.error = error;
    cleanup(state.unsubs);
    preloadedAds.delete(placement);
    track(Events.REWARDED_AD_FAILED, adProps(placement, {
      source: 'preload',
      reason: 'load_error',
      code: error?.code || null,
      message: error?.message || null,
    }));
    logAdDebug('load_error', { placement, code: error?.code || null, message: error?.message || null });
  }));

  preloadedAds.set(placement, state);
  try {
    track(Events.REWARDED_AD_REQUESTED, adProps(placement, { source: 'preload' }));
    state.loadTimer = setTimeout(() => {
      if (!state.loading || state.loaded) return;
      state.loading = false;
      state.phase = 'failed';
      state.reason = 'load_timeout';
      cleanup(state.unsubs);
      preloadedAds.delete(placement);
      track(Events.REWARDED_AD_FAILED, adProps(placement, { source: 'preload', reason: 'load_timeout' }));
      logAdDebug('load_timeout', { placement });
    }, LOAD_TIMEOUT_MS);
    state.ad.load();
  } catch (err) {
    clearTimeout(state.loadTimer);
    cleanup(state.unsubs);
    preloadedAds.delete(placement);
    preloadedAds.set(placement, {
      loaded: false,
      loading: false,
      reason: 'failed_to_load',
      error: err,
    });
  }

  return getRewardedAdStatus(placement);
}

function showPreloadedRewardedAd({ placement, metadata }) {
  const state = preloadedAds.get(placement);
  if (!state?.ad || !state.loaded || state.showing) {
    logAdDebug('not_ready', { placement, status: getRewardedAdStatus(placement) });
    return Promise.resolve({
      ok: false,
      rewarded: false,
      reason: state?.loading ? 'ad_loading' : 'ad_not_ready',
      placement,
    });
  }

  return new Promise((resolve) => {
    const ads = loadGoogleMobileAds();
    const { RewardedAdEventType, AdEventType } = ads || {};
    if (!RewardedAdEventType || !AdEventType) {
      resolve({ ok: false, rewarded: false, reason: 'ad_sdk_unavailable', placement });
      return;
    }

    cleanup(state.unsubs);
    state.unsubs = [];
    state.showing = true;
    state.loaded = false;
    state.loading = false;
    state.phase = 'showing';
    let settled = false;
    let opened = false;
    let earnedReward = null;
    let closed = false;
    let showTimer = null;
    let closeGraceTimer = null;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(showTimer);
      clearTimeout(closeGraceTimer);
      state.phase = result.rewarded ? 'rewardEarned' : (result.reason === 'ad_closed_before_reward' ? 'closed' : 'failed');
      logAdDebug('settled', {
        placement,
        phase: state.phase,
        rewarded: !!result.rewarded,
        reason: result.reason || null,
        source: 'preloaded',
      });
      cleanup(state.unsubs);
      preloadedAds.delete(placement);
      if (result.rewarded) {
        track(Events.REWARD_GRANTED, adProps(placement, { reward: result.reward || null, source: 'preloaded' }));
      } else {
        track(Events.REWARD_DENIED, adProps(placement, { reason: result.reason || 'not_rewarded', source: 'preloaded' }));
      }
      preloadRewardedAd({ placement }).catch(() => null);
      resolve(result);
    };

    state.unsubs.push(state.ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      earnedReward = reward || { type: 'reward', amount: 1 };
      state.phase = 'rewardEarned';
      track(Events.REWARDED_AD_EARNED, adProps(placement, { reward: earnedReward, source: 'preloaded' }));
      logAdDebug('reward_earned', { placement, source: 'preloaded' });
      if (closed) {
        settle({
          ok: true,
          rewarded: true,
          reward: earnedReward,
          placement,
          adUnitId: state.unitId,
          opened,
          loaded: true,
          source: 'admob_preloaded',
          metadata: metadata || null,
        });
      }
    }));

    state.unsubs.push(state.ad.addAdEventListener(AdEventType.OPENED, () => {
      opened = true;
      track(Events.REWARDED_AD_OPENED, adProps(placement, { source: 'preloaded' }));
      logAdDebug('opened', { placement, source: 'preloaded' });
    }));

    state.unsubs.push(state.ad.addAdEventListener(AdEventType.CLOSED, () => {
      closed = true;
      state.phase = earnedReward ? 'rewardEarned' : 'closed';
      track(Events.REWARDED_AD_CLOSED, adProps(placement, { earned: !!earnedReward, source: 'preloaded' }));
      logAdDebug('closed', { placement, earned: !!earnedReward, source: 'preloaded' });
      const result = {
        ok: !!earnedReward,
        rewarded: !!earnedReward,
        reward: earnedReward,
        reason: earnedReward ? undefined : 'ad_closed_before_reward',
        placement,
        adUnitId: state.unitId,
        opened,
        loaded: true,
        source: 'admob_preloaded',
        metadata: metadata || null,
      };
      if (earnedReward) settle(result);
      else closeGraceTimer = setTimeout(() => settle(result), REWARD_CLOSE_GRACE_MS);
    }));

    state.unsubs.push(state.ad.addAdEventListener(AdEventType.ERROR, (error) => {
      const reason = opened ? 'show_error' : 'failed_to_show';
      track(Events.REWARDED_AD_FAILED, adProps(placement, {
        reason,
        source: 'preloaded',
        code: error?.code || null,
        message: error?.message || null,
      }));
      state.phase = 'failed';
      logAdDebug('error', { placement, reason, code: error?.code || null, message: error?.message || null, source: 'preloaded' });
      settle({ ok: false, rewarded: false, reason, placement, error });
    }));

    showTimer = setTimeout(() => {
      track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: opened ? 'show_timeout' : 'open_timeout', source: 'preloaded' }));
      state.phase = 'failed';
      logAdDebug('timeout', { placement, reason: opened ? 'show_timeout' : 'open_timeout', source: 'preloaded' });
      settle({ ok: false, rewarded: false, reason: opened ? 'show_timeout' : 'open_timeout', placement });
    }, SHOW_TIMEOUT_MS);

    try {
      state.ad.show();
      logAdDebug('show_called', { placement, source: 'preloaded' });
    } catch (err) {
      track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'show_throw', message: err?.message, source: 'preloaded' }));
      state.phase = 'failed';
      logAdDebug('show_throw', { placement, message: err?.message || null, source: 'preloaded' });
      settle({ ok: false, rewarded: false, reason: 'failed_to_show', placement });
    }
  });
}

async function showNativeRewardedAd({ placement, metadata }) {
  const native = await getNativeAds(placement);
  if (native.error === 'missing_ad_unit_id') {
    track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'missing_ad_unit_id' }));
    track(Events.REWARD_DENIED, adProps(placement, { reason: 'missing_ad_unit_id' }));
    logAdDebug('missing_unit_id', { placement, unitIdPresent: false });
    return { ok: false, rewarded: false, reason: 'missing_ad_unit_id', placement };
  }

  if (native.error === 'ad_sdk_unavailable') {
    track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'ad_sdk_unavailable' }));
    track(Events.REWARD_DENIED, adProps(placement, { reason: 'ad_sdk_unavailable' }));
    logAdDebug('sdk_unavailable', { placement });
    return { ok: false, rewarded: false, reason: 'ad_sdk_unavailable', placement };
  }

  const {
    RewardedAd,
    RewardedAdEventType,
    AdEventType,
  } = native.ads;
  const unitId = native.unitId;

  return new Promise((resolve) => {
    const unsubs = [];
    let settled = false;
    let loaded = false;
    let opened = false;
    let earnedReward = null;
    let closed = false;
    let phase = 'idle';
    let loadTimer = null;
    let showTimer = null;
    let closeGraceTimer = null;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimer);
      clearTimeout(showTimer);
      clearTimeout(closeGraceTimer);
      phase = result.rewarded ? 'rewardEarned' : (result.reason === 'ad_closed_before_reward' ? 'closed' : 'failed');
      logAdDebug('settled', {
        placement,
        phase,
        rewarded: !!result.rewarded,
        reason: result.reason || null,
      });
      cleanup(unsubs);
      if (result.rewarded) {
        track(Events.REWARD_GRANTED, adProps(placement, { reward: result.reward || null }));
      } else {
        track(Events.REWARD_DENIED, adProps(placement, { reason: result.reason || 'not_rewarded' }));
      }
      resolve(result);
    };

    let rewardedAd;
    try {
      rewardedAd = RewardedAd.createForAdRequest(unitId, {
        requestNonPersonalizedAdsOnly: true,
        serverSideVerificationOptions: metadata?.installId
          ? {
            userId: String(metadata.installId).slice(0, 64),
            customData: JSON.stringify({
              placement,
              category: metadata.category || null,
              heroId: metadata.heroId || null,
            }).slice(0, 256),
          }
          : undefined,
      });
    } catch (err) {
      track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'create_throw', message: err?.message }));
      settle({ ok: false, rewarded: false, reason: 'ad_sdk_create_failed', placement });
      return;
    }

    unsubs.push(rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
      loaded = true;
      phase = 'ready';
      track(Events.REWARDED_AD_LOADED, adProps(placement));
      logAdDebug('loaded', { placement });
      try {
        phase = 'showing';
        rewardedAd.show();
        logAdDebug('show_called', { placement });
      } catch (err) {
        track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'show_throw', message: err?.message }));
        phase = 'failed';
        logAdDebug('show_throw', { placement, message: err?.message || null });
        settle({ ok: false, rewarded: false, reason: 'failed_to_show', placement });
      }
    }));

    unsubs.push(rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      earnedReward = reward || { type: 'reward', amount: 1 };
      phase = 'rewardEarned';
      track(Events.REWARDED_AD_EARNED, adProps(placement, { reward: earnedReward }));
      logAdDebug('reward_earned', { placement });
      if (closed) {
        settle({
          ok: true,
          rewarded: true,
          reward: earnedReward,
          placement,
          adUnitId: unitId,
          opened,
          loaded,
          source: 'admob',
          metadata: metadata || null,
        });
      }
    }));

    unsubs.push(rewardedAd.addAdEventListener(AdEventType.OPENED, () => {
      opened = true;
      phase = 'showing';
      track(Events.REWARDED_AD_OPENED, adProps(placement));
      logAdDebug('opened', { placement });
    }));

    unsubs.push(rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
      closed = true;
      phase = earnedReward ? 'rewardEarned' : 'closed';
      track(Events.REWARDED_AD_CLOSED, adProps(placement, { earned: !!earnedReward }));
      logAdDebug('closed', { placement, earned: !!earnedReward });
      const result = {
        ok: !!earnedReward,
        rewarded: !!earnedReward,
        reward: earnedReward,
        reason: earnedReward ? undefined : 'ad_closed_before_reward',
        placement,
        adUnitId: unitId,
        opened,
        loaded,
        source: 'admob',
        metadata: metadata || null,
      };
      if (earnedReward) settle(result);
      else closeGraceTimer = setTimeout(() => settle(result), REWARD_CLOSE_GRACE_MS);
    }));

    unsubs.push(rewardedAd.addAdEventListener(AdEventType.ERROR, (error) => {
      const reason = opened ? 'show_error' : 'load_error';
      track(Events.REWARDED_AD_FAILED, adProps(placement, {
        reason,
        code: error?.code || null,
        message: error?.message || null,
      }));
      phase = 'failed';
      logAdDebug('error', { placement, reason, code: error?.code || null, message: error?.message || null });
      settle({ ok: false, rewarded: false, reason, placement, error });
    }));

    loadTimer = setTimeout(() => {
      if (!loaded) {
        track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'load_timeout' }));
        phase = 'failed';
        logAdDebug('timeout', { placement, reason: 'load_timeout' });
        settle({ ok: false, rewarded: false, reason: 'load_timeout', placement });
      }
    }, LOAD_TIMEOUT_MS);

    showTimer = setTimeout(() => {
      if (loaded && !earnedReward) {
        track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: opened ? 'show_timeout' : 'open_timeout' }));
        phase = 'failed';
        logAdDebug('timeout', { placement, reason: opened ? 'show_timeout' : 'open_timeout' });
        settle({ ok: false, rewarded: false, reason: opened ? 'show_timeout' : 'open_timeout', placement });
      }
    }, SHOW_TIMEOUT_MS);

    try {
      phase = 'loading';
      track(Events.REWARDED_AD_REQUESTED, adProps(placement));
      logAdDebug('load_requested', { placement, unitIdPresent: true });
      rewardedAd.load();
    } catch (err) {
      track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'load_throw', message: err?.message }));
      phase = 'failed';
      logAdDebug('load_throw', { placement, message: err?.message || null });
      settle({ ok: false, rewarded: false, reason: 'failed_to_load', placement });
    }
  });
}

function hasReadyPreloadedAd(placement) {
  const state = preloadedAds.get(placement);
  return !!state?.ad && state.loaded && !state.showing;
}

export async function showRewardedAd({
  placement,
  metadata,
  preferLoaded = false,
  requireLoaded = false,
} = {}) {
  if (mockAdsEnabled()) {
    track(Events.REWARDED_AD_REQUESTED, adProps(placement, { source: 'mock' }));
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    track(Events.REWARDED_AD_LOADED, adProps(placement, { source: 'mock' }));
    track(Events.REWARDED_AD_OPENED, adProps(placement, { source: 'mock' }));
    track(Events.REWARDED_AD_EARNED, adProps(placement, { source: 'mock' }));
    track(Events.REWARDED_AD_CLOSED, adProps(placement, { source: 'mock', earned: true }));
    track(Events.REWARD_GRANTED, adProps(placement, { source: 'mock' }));
    return {
      ok: true,
      rewarded: true,
      source: 'mock',
      placement,
      adUnitId: 'mock',
      metadata: metadata || null,
    };
  }

  if ((preferLoaded || requireLoaded) && hasReadyPreloadedAd(placement)) {
    return showPreloadedRewardedAd({ placement, metadata });
  }

  if (requireLoaded) {
    return showPreloadedRewardedAd({ placement, metadata });
  }

  return showNativeRewardedAd({ placement, metadata });
}
