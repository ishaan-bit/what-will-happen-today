import { Platform } from 'react-native';
import { track, Events } from '@/services/analyticsService';

const MOCK_DELAY_MS = 850;
const LOAD_TIMEOUT_MS = 12000;
const SHOW_TIMEOUT_MS = 90000;

function mockAdsEnabled() {
  return process.env.EXPO_PUBLIC_REWARDED_AD_MOCK === 'true';
}

export function getRewardedAdUnitId(placement) {
  if (placement === 'hero_shuffle') {
    return process.env.EXPO_PUBLIC_ADMOB_REWARDED_HERO_UNIT_ID || '';
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

async function showNativeRewardedAd({ placement, metadata }) {
  const unitId = getRewardedAdUnitId(placement);
  if (!unitId) {
    track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'missing_ad_unit_id' }));
    track(Events.REWARD_DENIED, adProps(placement, { reason: 'missing_ad_unit_id' }));
    return { ok: false, rewarded: false, reason: 'missing_ad_unit_id', placement };
  }

  const ads = loadGoogleMobileAds();
  if (!ads?.RewardedAd || !ads?.RewardedAdEventType || !ads?.AdEventType) {
    track(Events.REWARDED_AD_FAILED, adProps(placement, { reason: 'ad_sdk_unavailable' }));
    track(Events.REWARD_DENIED, adProps(placement, { reason: 'ad_sdk_unavailable' }));
    return { ok: false, rewarded: false, reason: 'ad_sdk_unavailable', placement };
  }

  const {
    RewardedAd,
    RewardedAdEventType,
    AdEventType,
  } = ads;
  const mobileAds = ads.default || ads.mobileAds;

  try {
    await mobileAds?.().initialize?.();
  } catch {
    // Initialization failures are reported by load/show events below.
  }

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

export async function showRewardedAd({ placement, metadata } = {}) {
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

  return showNativeRewardedAd({ placement, metadata });
}
