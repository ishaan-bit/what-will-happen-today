import { Platform } from 'react-native';
import { track, Events } from '@/services/analyticsService';

const MOCK_DELAY_MS = 850;
const LOAD_TIMEOUT_MS = 12000;
const SHOW_TIMEOUT_MS = 90000;
const REWARD_CLOSE_GRACE_MS = 750;
const HERO_PLACEMENT = 'hero_shuffle';
const TEST_REWARDED_UNIT_IDS = {
  android: 'ca-app-pub-3940256099942544/5224354917',
  ios: 'ca-app-pub-3940256099942544/1712485313',
};
const rewardedPlacements = new Map();

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

  if (placement === HERO_PLACEMENT) {
    const androidSpecific = process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_HERO_UNIT_ID;
    const iosSpecific = process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_HERO_UNIT_ID;
    const generic = process.env.EXPO_PUBLIC_ADMOB_REWARDED_HERO_UNIT_ID;
    const signal = process.env.EXPO_PUBLIC_ADMOB_REWARDED_SIGNAL_UNIT_ID;

    const unitId = (Platform.OS === 'android' ? androidSpecific : iosSpecific)
      || generic
      || signal
      || '';
    // Log hero-specific placement diagnostics
    logHeroAdDebug('unit_id_resolution', {
      placement,
      platform: Platform.OS,
      androidSpecificPresent: !!androidSpecific,
      iosSpecificPresent: !!iosSpecific,
      genericPresent: !!generic,
      signalFallbackPresent: !!signal,
      finalUnitIdPresent: !!unitId,
      finalUnitIdSuffix: unitId ? unitId.split('/').pop() : null,
    });

    return unitId;
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
  unsubs?.forEach((unsubscribe) => {
    try { unsubscribe?.(); } catch {}
  });
}

function compactError(error) {
  return {
    code: error?.code || null,
    message: error?.message || null,
  };
}

function logAdDebug(label, data = {}) {
  const { unitId, adUnitId, ...safeData } = data || {};
  const shouldLog = process.env.EXPO_PUBLIC_ADMOB_DEBUG === 'true'
    || (typeof __DEV__ !== 'undefined' && __DEV__);
  if (!shouldLog) return;
  console.log(`[rewarded:${label}]`, safeData);
}

function logHeroAdDebug(label, data = {}) {
  const { unitId, adUnitId, ...safeData } = data || {};
  // Always log hero-specific diagnostics for production debugging
  console.log(`[hero-rewarded:${label}]`, safeData);
}

async function getNativeAds(placement) {
  const unitId = getRewardedAdUnitId(placement);
  const isHeroPlacement = placement === HERO_PLACEMENT;

  if (!unitId) {
    if (isHeroPlacement) {
      logHeroAdDebug('missing_unit_id', { placement, testMode: nativeAdTestModeEnabled() });
    } else {
      logAdDebug('unit_id_check', { placement, unitIdPresent: false, testMode: nativeAdTestModeEnabled() });
    }
    return { error: 'missing_ad_unit_id', unitId: '' };
  }

  if (isHeroPlacement) {
    logHeroAdDebug('unit_id_present', { placement, unitIdSuffix: unitId.split('/').pop() });
  } else {
    logAdDebug('unit_id_check', { placement, unitIdPresent: true, testMode: nativeAdTestModeEnabled() });
  }

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

function createPlacementState(placement, patch = {}) {
  return {
    placement,
    ad: null,
    unitId: '',
    phase: 'idle',
    loaded: false,
    loading: false,
    showing: false,
    unsubs: [],
    loadTimer: null,
    reason: null,
    error: null,
    ...patch,
  };
}

function clearPlacementInstance(state) {
  if (!state) return;
  clearTimeout(state.loadTimer);
  cleanup(state.unsubs);
  state.unsubs = [];
  state.loadTimer = null;
  state.ad = null;
}

function resetPlacementState(placement, phase = 'idle', patch = {}) {
  const existing = rewardedPlacements.get(placement);
  clearPlacementInstance(existing);
  const state = createPlacementState(placement, {
    unitId: existing?.unitId || '',
    phase,
    loaded: phase === 'loaded',
    loading: phase === 'loading',
    showing: phase === 'showing',
    ...patch,
  });
  rewardedPlacements.set(placement, state);
  return state;
}

function getPlacementState(placement) {
  const existing = rewardedPlacements.get(placement);
  if (existing) return existing;
  const state = createPlacementState(placement);
  rewardedPlacements.set(placement, state);
  return state;
}

export function getRewardedAdStatus(placement = 'locked_signal') {
  if (mockAdsEnabled()) {
    return { loaded: true, loading: false, showing: false, phase: 'loaded', state: 'loaded', reason: 'mock' };
  }
  const state = rewardedPlacements.get(placement);
  const phase = state?.phase || 'idle';
  return {
    loaded: phase === 'loaded' && !!state?.ad,
    loading: phase === 'loading',
    showing: phase === 'showing',
    phase,
    state: phase,
    error: state?.error || null,
    reason: state?.reason || null,
  };
}

export async function preloadRewardedAd({ placement = 'locked_signal', forceFresh = false } = {}) {
  if (mockAdsEnabled()) return getRewardedAdStatus(placement);

  const existing = rewardedPlacements.get(placement);
  if (!forceFresh && ['loading', 'loaded', 'showing'].includes(existing?.phase)) {
    return getRewardedAdStatus(placement);
  }

  clearPlacementInstance(existing);
  const native = await getNativeAds(placement);
  if (native.error) {
    const phase = native.error === 'missing_ad_unit_id' || native.error === 'ad_sdk_unavailable'
      ? 'unavailable'
      : 'failed';
    resetPlacementState(placement, phase, {
      reason: native.error,
      unitId: native.unitId || '',
      error: null,
    });
    logAdDebug(phase === 'unavailable' ? 'unavailable' : 'failed to load', {
      placement,
      reason: native.error,
      unitIdPresent: false,
    });
    return getRewardedAdStatus(placement);
  }

  const { RewardedAd, RewardedAdEventType, AdEventType } = native.ads;
  const state = createPlacementState(placement, {
    unitId: native.unitId,
    phase: 'loading',
    loading: true,
  });

  try {
    logAdDebug('create fresh instance', { placement, unitIdPresent: true });
    state.ad = RewardedAd.createForAdRequest(native.unitId, {
      requestNonPersonalizedAdsOnly: true,
    });
  } catch (err) {
    resetPlacementState(placement, 'failed', {
      reason: 'ad_sdk_create_failed',
      error: err,
      unitId: native.unitId,
    });
    logAdDebug('failed to load', { placement, reason: 'ad_sdk_create_failed', ...compactError(err) });
    return getRewardedAdStatus(placement);
  }

  const failLoad = (reason, error = null) => {
    if (rewardedPlacements.get(placement) !== state) return;
    clearTimeout(state.loadTimer);
    state.loaded = false;
    state.loading = false;
    state.showing = false;
    state.phase = 'failed';
    state.reason = reason;
    state.error = error;
    state.ad = null;
    cleanup(state.unsubs);
    state.unsubs = [];
    track(Events.REWARDED_AD_FAILED, adProps(placement, {
      source: 'preload',
      reason,
      ...compactError(error),
    }));
    if (reason === 'load_timeout') {
      logAdDebug('timeout while loading', { placement });
    } else {
      logAdDebug('failed to load', { placement, ...compactError(error), reason });
    }
  };

  state.unsubs.push(state.ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
    if (rewardedPlacements.get(placement) !== state) return;
    clearTimeout(state.loadTimer);
    state.loaded = true;
    state.loading = false;
    state.showing = false;
    state.phase = 'loaded';
    state.reason = null;
    state.error = null;
    track(Events.REWARDED_AD_LOADED, adProps(placement, { source: 'preload' }));
    logAdDebug('loaded', { placement });
  }));

  state.unsubs.push(state.ad.addAdEventListener(AdEventType.ERROR, (error) => {
    failLoad('load_error', error);
  }));

  rewardedPlacements.set(placement, state);
  try {
    track(Events.REWARDED_AD_REQUESTED, adProps(placement, { source: 'preload' }));
    logAdDebug('load start', { placement, unitIdPresent: true });
    state.loadTimer = setTimeout(() => {
      if (state.phase !== 'loading') return;
      failLoad('load_timeout');
    }, LOAD_TIMEOUT_MS);
    state.ad.load();
  } catch (err) {
    failLoad('failed_to_load', err);
  }

  return getRewardedAdStatus(placement);
}

function showPreloadedRewardedAd({ placement, metadata }) {
  const state = getPlacementState(placement);
  if (!state?.ad || state.phase !== 'loaded') {
    logAdDebug('not ready', { placement, status: getRewardedAdStatus(placement) });
    return Promise.resolve({
      ok: false,
      rewarded: false,
      reason: state?.phase === 'loading'
        ? 'ad_loading'
        : (state?.phase === 'unavailable' ? 'ad_unavailable' : (state?.reason || 'ad_not_ready')),
      placement,
    });
  }

  return new Promise((resolve) => {
    const ads = loadGoogleMobileAds();
    const { RewardedAdEventType, AdEventType } = ads || {};
    if (!RewardedAdEventType || !AdEventType) {
      resetPlacementState(placement, 'unavailable', { reason: 'ad_sdk_unavailable' });
      resolve({ ok: false, rewarded: false, reason: 'ad_sdk_unavailable', placement });
      return;
    }

    cleanup(state.unsubs);
    state.unsubs = [];
    state.showing = true;
    state.loaded = false;
    state.loading = false;
    state.phase = 'showing';
    state.reason = null;
    state.error = null;
    let settled = false;
    let opened = false;
    let earnedReward = null;
    let closed = false;
    let showTimer = null;
    let closeGraceTimer = null;

    const reloadNext = () => {
      logAdDebug('reset/reload', { placement });
      resetPlacementState(placement, 'idle', { unitId: state.unitId });
      preloadRewardedAd({ placement, forceFresh: true }).catch(() => null);
    };

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(showTimer);
      clearTimeout(closeGraceTimer);
      cleanup(state.unsubs);
      if (result.rewarded) {
        track(Events.REWARD_GRANTED, adProps(placement, { reward: result.reward || null, source: 'preloaded' }));
      } else {
        track(Events.REWARD_DENIED, adProps(placement, { reason: result.reason || 'not_rewarded', source: 'preloaded' }));
      }
      reloadNext();
      resolve(result);
    };

    state.unsubs.push(state.ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      earnedReward = reward || { type: 'reward', amount: 1 };
      state.phase = 'showing';
      track(Events.REWARDED_AD_EARNED, adProps(placement, { reward: earnedReward, source: 'preloaded' }));
      logAdDebug('earned reward', { placement });
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
      state.phase = 'showing';
      track(Events.REWARDED_AD_OPENED, adProps(placement, { source: 'preloaded' }));
      logAdDebug('opened', { placement });
    }));

    state.unsubs.push(state.ad.addAdEventListener(AdEventType.CLOSED, () => {
      closed = true;
      track(Events.REWARDED_AD_CLOSED, adProps(placement, { earned: !!earnedReward, source: 'preloaded' }));
      logAdDebug('closed', { placement, earned: !!earnedReward });
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
        ...compactError(error),
      }));
      state.phase = 'failed';
      state.reason = reason;
      state.error = error;
      logAdDebug('show failed', { placement, ...compactError(error), reason });
      settle({ ok: false, rewarded: false, reason, placement, error });
    }));

    showTimer = setTimeout(() => {
      const reason = opened ? 'show_timeout' : 'open_timeout';
      track(Events.REWARDED_AD_FAILED, adProps(placement, { reason, source: 'preloaded' }));
      state.phase = 'failed';
      state.reason = reason;
      logAdDebug('show failed', { placement, reason });
      settle({ ok: false, rewarded: false, reason, placement });
    }, SHOW_TIMEOUT_MS);

    try {
      logAdDebug('show attempt', { placement });
      state.ad.show();
    } catch (err) {
      track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'show_throw', message: err?.message, source: 'preloaded' }));
      state.phase = 'failed';
      state.reason = 'failed_to_show';
      state.error = err;
      logAdDebug('show failed', { placement, ...compactError(err), reason: 'show_throw' });
      settle({ ok: false, rewarded: false, reason: 'failed_to_show', placement });
    }
  });
}

async function showNativeRewardedAd({ placement, metadata }) {
  const isHeroPlacement = placement === HERO_PLACEMENT;
  const native = await getNativeAds(placement);

  if (native.error === 'missing_ad_unit_id') {
    if (isHeroPlacement) {
      logHeroAdDebug('show_failed_missing_unit_id', { error: native.error });
    }
    track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'missing_ad_unit_id' }));
    track(Events.REWARD_DENIED, adProps(placement, { reason: 'missing_ad_unit_id' }));
    logAdDebug('missing unit id', { placement, unitIdPresent: false });
    return { ok: false, rewarded: false, reason: 'missing_ad_unit_id', placement };
  }

  if (native.error === 'ad_sdk_unavailable') {
    if (isHeroPlacement) {
      logHeroAdDebug('show_failed_sdk_unavailable', { error: native.error });
    }
    track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'ad_sdk_unavailable' }));
    track(Events.REWARD_DENIED, adProps(placement, { reason: 'ad_sdk_unavailable' }));
    logAdDebug('sdk unavailable', { placement });
    return { ok: false, rewarded: false, reason: 'ad_sdk_unavailable', placement };
  }

  const {
    RewardedAd,
    RewardedAdEventType,
    AdEventType,
  } = native.ads;
  const unitId = native.unitId;

  if (isHeroPlacement) {
    logHeroAdDebug('load_start', { unitIdSuffix: unitId.split('/').pop() });
  }

  return new Promise((resolve) => {
    const unsubs = [];
    let settled = false;
    let loaded = false;
    let opened = false;
    let earnedReward = null;
    let closed = false;
    let loadTimer = null;
    let showTimer = null;
    let closeGraceTimer = null;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimer);
      clearTimeout(showTimer);
      clearTimeout(closeGraceTimer);
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
      if (isHeroPlacement) {
        logHeroAdDebug('ad_loaded', {});
      } else {
        logAdDebug('loaded', { placement });
      }
      try {
        logAdDebug('show attempt', { placement });
        if (isHeroPlacement) {
          logHeroAdDebug('show_attempt', {});
        }
        rewardedAd.show();
      } catch (err) {
        track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'show_throw', message: err?.message }));
        logAdDebug('show failed', { placement, ...compactError(err), reason: 'show_throw' });
        if (isHeroPlacement) {
          logHeroAdDebug('show_failed_throw', { reason: 'show_throw', code: err?.code, message: err?.message });
        }
        settle({ ok: false, rewarded: false, reason: 'failed_to_show', placement });
      }
    }));

    unsubs.push(rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      earnedReward = reward || { type: 'reward', amount: 1 };
      track(Events.REWARDED_AD_EARNED, adProps(placement, { reward: earnedReward }));
      if (isHeroPlacement) {
        logHeroAdDebug('reward_earned', { reward: earnedReward });
      } else {
        logAdDebug('earned reward', { placement });
      }
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
      track(Events.REWARDED_AD_OPENED, adProps(placement));
      if (isHeroPlacement) {
        logHeroAdDebug('ad_opened', {});
      } else {
        logAdDebug('opened', { placement });
      }
    }));

    unsubs.push(rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
      closed = true;
      track(Events.REWARDED_AD_CLOSED, adProps(placement, { earned: !!earnedReward }));
      if (isHeroPlacement) {
        logHeroAdDebug('ad_closed', { earned: !!earnedReward });
      } else {
        logAdDebug('closed', { placement, earned: !!earnedReward });
      }
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
        ...compactError(error),
      }));
      logAdDebug(opened ? 'show failed' : 'failed to load', { placement, reason, ...compactError(error) });
      if (isHeroPlacement) {
        logHeroAdDebug('ad_error', {
          reason,
          code: error?.code || null,
          message: error?.message || null,
          opened,
          loaded,
          unitIdSuffix: unitId.split('/').pop(),
        });
      }
      settle({ ok: false, rewarded: false, reason, placement, error });
    }));

    loadTimer = setTimeout(() => {
      if (!loaded) {
        track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'load_timeout' }));
        logAdDebug('timeout while loading', { placement });
        if (isHeroPlacement) {
          logHeroAdDebug('load_timeout', { loadedMs: LOAD_TIMEOUT_MS, unitIdSuffix: unitId.split('/').pop() });
        }
        settle({ ok: false, rewarded: false, reason: 'load_timeout', placement });
      }
    }, LOAD_TIMEOUT_MS);

    showTimer = setTimeout(() => {
      if (loaded && !earnedReward) {
        const reason = opened ? 'show_timeout' : 'open_timeout';
        track(Events.REWARDED_AD_FAILED, adProps(placement, { reason }));
        logAdDebug('show failed', { placement, reason });
        if (isHeroPlacement) {
          logHeroAdDebug(reason, { opened });
        }
        settle({ ok: false, rewarded: false, reason, placement });
      }
    }, SHOW_TIMEOUT_MS);

    try {
      track(Events.REWARDED_AD_REQUESTED, adProps(placement));
      logAdDebug('load start', { placement, unitIdPresent: true });
      rewardedAd.load();
    } catch (err) {
      track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'load_throw', message: err?.message }));
      logAdDebug('failed to load', { placement, ...compactError(err), reason: 'load_throw' });
      settle({ ok: false, rewarded: false, reason: 'failed_to_load', placement });
    }
  });
}

function hasReadyPreloadedAd(placement) {
  const state = rewardedPlacements.get(placement);
  return !!state?.ad && state.phase === 'loaded';
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

export function getHeroAdStatus() {
  return getRewardedAdStatus(HERO_PLACEMENT);
}

export function loadHeroAd(options = {}) {
  return preloadRewardedAd({ placement: HERO_PLACEMENT, ...options });
}

export function showHeroAd({ metadata } = {}) {
  return showRewardedAd({ placement: HERO_PLACEMENT, metadata });
}
