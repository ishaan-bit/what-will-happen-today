import { Platform } from 'react-native';
import { track, Events } from '@/services/analyticsService';

const MOCK_DELAY_MS = 850;
const LOAD_TIMEOUT_MS = 12000;
const SHOW_TIMEOUT_MS = 90000;
const preloadedAds = new Map();

function mockAdsEnabled() {
  return process.env.EXPO_PUBLIC_REWARDED_AD_MOCK === 'true';
}

export function getRewardedAdUnitId(placement) {
  if (placement === 'hero_shuffle') {
    return process.env.EXPO_PUBLIC_ADMOB_REWARDED_HERO_UNIT_ID
      || process.env.EXPO_PUBLIC_ADMOB_REWARDED_SIGNAL_UNIT_ID
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
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[rewarded:${label}]`, data);
  }
}

async function getNativeAds(placement) {
  const unitId = getRewardedAdUnitId(placement);
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
  if (mockAdsEnabled()) return { loaded: true, loading: false, reason: 'mock' };
  const state = preloadedAds.get(placement);
  return {
    loaded: !!state?.loaded,
    loading: !!state?.loading,
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
    state.reason = null;
    track(Events.REWARDED_AD_LOADED, adProps(placement, { source: 'preload' }));
    logAdDebug('loaded', { placement });
  }));

  unsubs.push(state.ad.addAdEventListener(AdEventType.ERROR, (error) => {
    clearTimeout(state.loadTimer);
    state.loaded = false;
    state.loading = false;
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
    let settled = false;
    let opened = false;
    let earnedReward = null;
    let showTimer = null;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(showTimer);
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
      track(Events.REWARDED_AD_EARNED, adProps(placement, { reward: earnedReward, source: 'preloaded' }));
    }));

    state.unsubs.push(state.ad.addAdEventListener(AdEventType.OPENED, () => {
      opened = true;
      track(Events.REWARDED_AD_OPENED, adProps(placement, { source: 'preloaded' }));
    }));

    state.unsubs.push(state.ad.addAdEventListener(AdEventType.CLOSED, () => {
      track(Events.REWARDED_AD_CLOSED, adProps(placement, { earned: !!earnedReward, source: 'preloaded' }));
      settle({
        ok: !!earnedReward,
        rewarded: !!earnedReward,
        reward: earnedReward,
        placement,
        adUnitId: state.unitId,
        opened,
        loaded: true,
        source: 'admob_preloaded',
        metadata: metadata || null,
      });
    }));

    state.unsubs.push(state.ad.addAdEventListener(AdEventType.ERROR, (error) => {
      const reason = opened ? 'show_error' : 'failed_to_show';
      track(Events.REWARDED_AD_FAILED, adProps(placement, {
        reason,
        source: 'preloaded',
        code: error?.code || null,
        message: error?.message || null,
      }));
      settle({ ok: false, rewarded: false, reason, placement, error });
    }));

    showTimer = setTimeout(() => {
      track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: opened ? 'show_timeout' : 'open_timeout', source: 'preloaded' }));
      settle({ ok: false, rewarded: false, reason: opened ? 'show_timeout' : 'open_timeout', placement });
    }, SHOW_TIMEOUT_MS);

    try {
      state.ad.show();
    } catch (err) {
      track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'show_throw', message: err?.message, source: 'preloaded' }));
      settle({ ok: false, rewarded: false, reason: 'failed_to_show', placement });
    }
  });
}

async function showNativeRewardedAd({ placement, metadata }) {
  const native = await getNativeAds(placement);
  if (native.error === 'missing_ad_unit_id') {
    track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'missing_ad_unit_id' }));
    track(Events.REWARD_DENIED, adProps(placement, { reason: 'missing_ad_unit_id' }));
    return { ok: false, rewarded: false, reason: 'missing_ad_unit_id', placement };
  }

  if (native.error === 'ad_sdk_unavailable') {
    track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'ad_sdk_unavailable' }));
    track(Events.REWARD_DENIED, adProps(placement, { reason: 'ad_sdk_unavailable' }));
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
    let loadTimer = null;
    let showTimer = null;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimer);
      clearTimeout(showTimer);
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
      track(Events.REWARDED_AD_LOADED, adProps(placement));
      try {
        rewardedAd.show();
      } catch (err) {
        track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'show_throw', message: err?.message }));
        settle({ ok: false, rewarded: false, reason: 'failed_to_show', placement });
      }
    }));

    unsubs.push(rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      earnedReward = reward || { type: 'reward', amount: 1 };
      track(Events.REWARDED_AD_EARNED, adProps(placement, { reward: earnedReward }));
    }));

    unsubs.push(rewardedAd.addAdEventListener(AdEventType.OPENED, () => {
      opened = true;
      track(Events.REWARDED_AD_OPENED, adProps(placement));
    }));

    unsubs.push(rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
      track(Events.REWARDED_AD_CLOSED, adProps(placement, { earned: !!earnedReward }));
      settle({
        ok: !!earnedReward,
        rewarded: !!earnedReward,
        reward: earnedReward,
        placement,
        adUnitId: unitId,
        opened,
        loaded,
        source: 'admob',
      });
    }));

    unsubs.push(rewardedAd.addAdEventListener(AdEventType.ERROR, (error) => {
      const reason = opened ? 'show_error' : 'load_error';
      track(Events.REWARDED_AD_FAILED, adProps(placement, {
        reason,
        code: error?.code || null,
        message: error?.message || null,
      }));
      settle({ ok: false, rewarded: false, reason, placement, error });
    }));

    loadTimer = setTimeout(() => {
      if (!loaded) {
        track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'load_timeout' }));
        settle({ ok: false, rewarded: false, reason: 'load_timeout', placement });
      }
    }, LOAD_TIMEOUT_MS);

    showTimer = setTimeout(() => {
      if (loaded && !earnedReward) {
        track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: opened ? 'show_timeout' : 'open_timeout' }));
        settle({ ok: false, rewarded: false, reason: opened ? 'show_timeout' : 'open_timeout', placement });
      }
    }, SHOW_TIMEOUT_MS);

    try {
      track(Events.REWARDED_AD_REQUESTED, adProps(placement));
      rewardedAd.load();
    } catch (err) {
      track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'load_throw', message: err?.message }));
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
