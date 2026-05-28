import { Platform } from 'react-native';
import { track, Events } from '@/services/analyticsService';

const HERO_PLACEMENT = 'hero_shuffle';
const LOAD_TIMEOUT_MS = 12000;
const MOCK_DELAY_MS = 850;
const TEST_REWARDED_UNIT_IDS = {
  android: 'ca-app-pub-3940256099942544/5224354917',
  ios: 'ca-app-pub-3940256099942544/1712485313',
};

function mockAdsEnabled() {
  return process.env.EXPO_PUBLIC_REWARDED_AD_MOCK === 'true';
}

function nativeAdTestModeEnabled() {
  return process.env.EXPO_PUBLIC_ADMOB_TEST_MODE === 'true'
    || (typeof __DEV__ !== 'undefined' && __DEV__);
}

function getHeroRewardedUnitId() {
  const platformHeroUnitId = Platform.OS === 'android'
    ? process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_HERO_UNIT_ID
    : process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_HERO_UNIT_ID;

  return platformHeroUnitId
    || process.env.EXPO_PUBLIC_ADMOB_REWARDED_HERO_UNIT_ID
    // Deliberate temporary fallback: signal rewarded units are already proven in production.
    || process.env.EXPO_PUBLIC_ADMOB_REWARDED_SIGNAL_UNIT_ID
    || (nativeAdTestModeEnabled()
      ? (TEST_REWARDED_UNIT_IDS[Platform.OS] || TEST_REWARDED_UNIT_IDS.android)
      : '')
    || '';
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

function logHeroAd(label, data = {}) {
  const { unitId, adUnitId, ...safeData } = data || {};
  console.log(`[hero-shuffle-ad] ${label}`, safeData);
}

function adProps(extra = {}) {
  return {
    ad_placement: HERO_PLACEMENT,
    platform: Platform.OS,
    ...extra,
  };
}

function denied(reason) {
  track(Events.REWARD_DENIED, adProps({ reason }));
  return { rewarded: false, reason };
}

export async function showHeroShuffleRewardedAd({ metadata } = {}) {
  if (mockAdsEnabled()) {
    logHeroAd('unit present yes', { source: 'mock' });
    logHeroAd('create fresh attempt', { source: 'mock' });
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    track(Events.REWARDED_AD_REQUESTED, adProps({ source: 'mock' }));
    track(Events.REWARDED_AD_LOADED, adProps({ source: 'mock' }));
    track(Events.REWARDED_AD_OPENED, adProps({ source: 'mock' }));
    track(Events.REWARDED_AD_EARNED, adProps({ source: 'mock' }));
    track(Events.REWARDED_AD_CLOSED, adProps({ source: 'mock', earned: true }));
    track(Events.REWARD_GRANTED, adProps({ source: 'mock' }));
    return { rewarded: true, source: 'mock', metadata: metadata || null };
  }

  const unitId = getHeroRewardedUnitId();
  logHeroAd(`unit present ${unitId ? 'yes' : 'no'}`);
  if (!unitId) {
    track(Events.REWARDED_AD_FAILED, adProps({ reason: 'missing_unit' }));
    return denied('missing_unit');
  }

  const ads = loadGoogleMobileAds();
  if (!ads?.RewardedAd || !ads?.RewardedAdEventType || !ads?.AdEventType) {
    track(Events.REWARDED_AD_FAILED, adProps({ reason: 'ad_sdk_unavailable' }));
    return denied('load_failed');
  }

  const mobileAds = ads.default || ads.mobileAds;
  try {
    await mobileAds?.().initialize?.();
  } catch {
    // Initialization failures are reported by load/show events below.
  }

  const { RewardedAd, RewardedAdEventType, AdEventType } = ads;
  const unsubs = [];
  let rewardedAd = null;
  let settled = false;
  let loaded = false;
  let showing = false;
  let loadTimer = null;

  return new Promise((resolve) => {
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimer);
      cleanup(unsubs);
      if (result.rewarded) {
        track(Events.REWARD_GRANTED, adProps({ reward: result.reward || null }));
      } else {
        track(Events.REWARD_DENIED, adProps({ reason: result.reason || 'not_rewarded' }));
      }
      resolve({
        ...result,
        metadata: metadata || null,
      });
    };

    try {
      logHeroAd('create fresh attempt');
      rewardedAd = RewardedAd.createForAdRequest(unitId, {
        requestNonPersonalizedAdsOnly: true,
        serverSideVerificationOptions: metadata?.installId
          ? {
            userId: String(metadata.installId).slice(0, 64),
            customData: JSON.stringify({
              placement: HERO_PLACEMENT,
              heroId: metadata.heroId || null,
            }).slice(0, 256),
          }
          : undefined,
      });
    } catch (error) {
      logHeroAd('load failed code/message', compactError(error));
      track(Events.REWARDED_AD_FAILED, adProps({ reason: 'load_failed', ...compactError(error) }));
      settle({ rewarded: false, reason: 'load_failed' });
      return;
    }

    unsubs.push(rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
      if (settled) return;
      loaded = true;
      clearTimeout(loadTimer);
      logHeroAd('loaded');
      track(Events.REWARDED_AD_LOADED, adProps());
      try {
        showing = true;
        logHeroAd('show start');
        rewardedAd.show();
      } catch (error) {
        logHeroAd('show failed code/message', compactError(error));
        track(Events.REWARDED_AD_FAILED, adProps({ reason: 'show_failed', ...compactError(error) }));
        settle({ rewarded: false, reason: 'show_failed' });
      }
    }));

    unsubs.push(rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      if (settled) return;
      const earnedReward = reward || { type: 'reward', amount: 1 };
      logHeroAd('earned reward');
      track(Events.REWARDED_AD_EARNED, adProps({ reward: earnedReward }));
      settle({ rewarded: true, reward: earnedReward });
    }));

    unsubs.push(rewardedAd.addAdEventListener(AdEventType.OPENED, () => {
      track(Events.REWARDED_AD_OPENED, adProps());
    }));

    unsubs.push(rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
      if (settled) return;
      logHeroAd('closed');
      track(Events.REWARDED_AD_CLOSED, adProps({ earned: false }));
      settle({ rewarded: false, reason: 'closed_before_reward' });
    }));

    unsubs.push(rewardedAd.addAdEventListener(AdEventType.ERROR, (error) => {
      if (settled) return;
      const reason = loaded || showing ? 'show_failed' : 'load_failed';
      logHeroAd(reason === 'show_failed' ? 'show failed code/message' : 'load failed code/message', compactError(error));
      track(Events.REWARDED_AD_FAILED, adProps({ reason, ...compactError(error) }));
      settle({ rewarded: false, reason });
    }));

    try {
      track(Events.REWARDED_AD_REQUESTED, adProps());
      logHeroAd('load start');
      loadTimer = setTimeout(() => {
        if (settled || loaded) return;
        logHeroAd('load timeout');
        track(Events.REWARDED_AD_FAILED, adProps({ reason: 'load_timeout' }));
        settle({ rewarded: false, reason: 'load_timeout' });
      }, LOAD_TIMEOUT_MS);
      rewardedAd.load();
    } catch (error) {
      logHeroAd('load failed code/message', compactError(error));
      track(Events.REWARDED_AD_FAILED, adProps({ reason: 'load_failed', ...compactError(error) }));
      settle({ rewarded: false, reason: 'load_failed' });
    }
  });
}
