import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
  InteractionManager,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { router, useFocusEffect } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { DayHeader } from '@/components/DayHeader';
import { SignalCard } from '@/components/SignalCard';
import { PaywallSheet } from '@/components/PaywallSheet';
import { SkeletonCard } from '@/components/SkeletonCard';
import { StarsBackground } from '@/components/StarsBackground';
import { HeroImage } from '@/components/HeroImage';
import { SafeBannerAd } from '@/components/SafeBannerAd';
import { usePredictions } from '@/hooks/usePredictions';
import { useBilling } from '@/hooks/useBilling';
import { PRODUCT_DAILY, PRODUCT_FULL } from '@/services/billingService';
import {
  grantDeeperMeaning,
  grantFreeSignal,
  grantSignalReveal,
  recordHeroShuffle,
  setCurrentHeroForToday,
} from '@/services/storageService';
import { getHeroAdStatus, loadHeroAd, showHeroAd, showRewardedAd } from '@/services/rewardedAdService';
import {
  getCategoryOrder,
  getDailyVibe,
  getDailyMoment,
  getDailyWatchFor,
} from '@/utils/freeCategory';
import { palette, spacing, type, radius } from '@/utils/theme';
import { TodaysSky } from '@/components/TodaysSky';
import { track, Events } from '@/services/analyticsService';
import { tap, unlock as unlockHaptic } from '@/utils/haptics';

function heroAnalyticsProps(hero, extra = {}) {
  return {
    hero_image_id: hero?.id || null,
    hero_tags: hero?.tags || [],
    readerMood: hero?.readerMood || null,
    source_campaign: hero?.campaign || null,
    ...extra,
  };
}

function cardAnalyticsProps(category, index, prediction, extra = {}) {
  return {
    card_id: prediction?.id || category,
    card_category: category,
    card_position: index,
    ...extra,
  };
}

function getHeroUrl(hero) {
  return hero?.mediaUrl || hero?.imageUrl || hero?.url || hero?.uri || hero?.src || null;
}

function logHeroShuffleDebug(label, data = {}) {
  console.log(`[hero-shuffle] ${label}`, data);
}

function heroRewardAlertForResult(result) {
  if (result?.reason === 'ad_closed_before_reward') {
    return {
      title: 'Reader unchanged',
      body: 'The reader image changes after the ad reward is completed.',
    };
  }

  if (result?.reason === 'ad_loading') {
    return {
      title: 'Ad still loading',
      body: 'The reader image did not change. Try again in a moment.',
    };
  }

  return {
    title: 'Ad unavailable',
    body: 'The reader image did not change. Try again in a moment.',
  };
}

function normalizeHero(hero) {
  const url = getHeroUrl(hero);
  if (!hero || !url) return null;
  const mediaType = hero.mediaType === 'video' ? 'video' : 'image';
  return {
    ...hero,
    url,
    mediaUrl: url,
    mediaType,
    ...(mediaType === 'image' ? { imageUrl: url } : {}),
    cta: hero.cta || hero.CTA || hero.ctaCopy || null,
  };
}

function isHumanReadableHeroText(value) {
  const text = String(value || '').trim();
  if (text.length < 3) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^\/?api\/hero-batch\/image\?/i.test(text)) return false;
  if (/^hero\s+\d+$/i.test(text)) return false;
  if (/^batch hero\s+\d+$/i.test(text)) return false;
  if (/^(asset|hero|img|image|file)[_-][a-z0-9_-]+$/i.test(text)) return false;
  if (/^[a-z0-9]+[-_][a-z0-9_-]*\d[a-z0-9_-]*$/i.test(text) && !/\s/.test(text)) return false;
  if (/\.(jpe?g|png|webp|gif|heic|mp4|m4v|webm)(\?.*)?$/i.test(text)) return false;
  if (/^[\w.-]+[\\/][\w./-]+$/i.test(text)) return false;
  if (/^[a-z0-9_-]+\.(jpe?g|png|webp|gif|heic)$/i.test(text)) return false;
  if (/^[0-9a-f]{8}[-\s][0-9a-f]{4}[-\s][0-9a-f]{4}[-\s][0-9a-f]{4}[-\s][0-9a-f]{12}$/i.test(text)) return false;
  if (/^[0-9a-f\s-]{16,}$/i.test(text)) return false;
  if (/^[a-z0-9_-]{24,}$/i.test(text) && !/\s/.test(text)) return false;
  const letters = text.match(/[a-z]/gi) || [];
  return letters.length >= 3;
}

function normalizeHeroCopy(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isGenericHeroFallbackHeadline(value, readerMood) {
  const text = normalizeHeroCopy(value).toLowerCase().replace(/[.!?]+$/, '');
  const mood = normalizeHeroCopy(readerMood).toLowerCase();
  if (!text) return true;
  if (text === 'today has a reader') return true;
  if (text === 'the mirror is waiting') return true;
  return !!mood && text === `${mood} is waiting`;
}

export default function HomeScreen() {
  const {
    predictions,
    heroImage,
    heroPool,
    monetizationConfig,
    revealState,
    heroShuffleState,
    entitlement,
    unlocked,
    loading,
    refreshUnlock,
    refreshRevealState,
    refresh,
    freeCategory,
    streak,
    dayNumber,
  } = usePredictions();

  const { getPrice, buyDaily, buyFull, purchasing } = useBilling();
  const { width } = useWindowDimensions();
  const [paywall, setPaywall] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastFocusRefreshAt = useRef(0);
  const hasFocusedOnce = useRef(false);
  const lastHeroImpressionRef = useRef(null);
  const scrollRef = useRef(null);
  const signalLayoutsRef = useRef({});
  const pendingSignalFocusRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const heroFade = useRef(new Animated.Value(1)).current;
  const heroShuffleAdInFlightRef = useRef(false);
  const [highlightedCategory, setHighlightedCategory] = useState(null);
  const [heroShuffleAdBusy, setHeroShuffleAdBusy] = useState(false);
  const [heroShuffleAdLoading, setHeroShuffleAdLoading] = useState(false);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => null);
  }, [loading]);

  const categoryOrder = useMemo(() => getCategoryOrder(freeCategory), [freeCategory]);
  const dailyPrice = getPrice(PRODUCT_DAILY);
  const fullPrice = getPrice(PRODUCT_FULL);
  const isPaidEntitled = unlocked || entitlement?.active;
  const revealMap = revealState?.revealedSignals || {};
  const deeperMap = revealState?.deeperMeanings || {};
  const freeSignalUsed = !!revealState?.freeSignalUsed || Object.keys(revealMap).length > 0;
  const firstCategory = categoryOrder[0];
  const revealedCount = isPaidEntitled ? categoryOrder.length : Object.keys(revealMap).length;
  const lockedCount = Math.max(0, categoryOrder.length - revealedCount);
  const hasAnyReveal = isPaidEntitled || freeSignalUsed;

  const heroImages = useMemo(() => {
    const poolImages = Array.isArray(heroPool?.images) ? heroPool.images : [];
    const source = poolImages.length ? poolImages : (getHeroUrl(heroImage) ? [heroImage] : []);
    return source.map(normalizeHero).filter(Boolean);
  }, [heroPool, heroImage]);

  const defaultHeroId = heroPool?.defaultHeroId || heroImages[0]?.id || null;
  const currentHero = useMemo(() => {
    const currentId = heroShuffleState?.currentHeroId || defaultHeroId;
    return heroImages.find((img) => img.id === currentId) || heroImages[0] || heroImage || null;
  }, [heroImages, heroImage, heroShuffleState?.currentHeroId, defaultHeroId]);
  const currentHeroVisualKey = currentHero?.id || currentHero?.url || null;
  const heroPoolRevision = heroPool?.revision || heroPool?.updatedAt || 'legacy';
  const rewardedAdsEnabled = monetizationConfig.rewardedAdsEnabled !== false;
  const todayUnlockEnabled = monetizationConfig.todayUnlockEnabled !== false;
  const thirtyDayUnlockEnabled = monetizationConfig.thirtyDayUnlockEnabled !== false;

  const maxHeroImages = Math.min(
    heroImages.length || 1,
    monetizationConfig.maxHeroImagesPerDay,
  );
  const maxHeroShuffles = Math.min(
    monetizationConfig.maxHeroShufflesPerDay,
    Math.max(0, maxHeroImages - 1),
  );
  const seenHeroIds = heroShuffleState?.seenHeroIds || [];
  const totalHeroShuffles = (heroShuffleState?.rewardedShuffles || 0) + (heroShuffleState?.paidShuffles || 0);
  const heroShuffleRemaining = Math.max(0, maxHeroShuffles - totalHeroShuffles);
  const hasAlternateHero = heroImages.some((img) => img.id !== currentHero?.id);
  const hasUnseenHero = heroImages.some((img) => img.id !== currentHero?.id && !seenHeroIds.includes(img.id));
  const canShuffleHeroByLimit = heroImages.length > 1
    && hasAlternateHero
    && hasUnseenHero
    && heroShuffleRemaining > 0
    && seenHeroIds.length < maxHeroImages;
  const canShuffleHero = canShuffleHeroByLimit && (isPaidEntitled || rewardedAdsEnabled);

  const shuffleRemainingText = useMemo(() => {
    if (!canShuffleHeroByLimit) return 'No more reader shuffles today.';
    if (heroShuffleRemaining === 1) return 'One more reader shuffle left today.';
    return `You can shuffle ${heroShuffleRemaining} more times today.`;
  }, [canShuffleHeroByLimit, heroShuffleRemaining]);

  useEffect(() => {
    if (!currentHero?.id || !heroShuffleState) return;
    if (heroShuffleState.currentHeroId === currentHero.id) return;
    setCurrentHeroForToday(currentHero.id, heroPoolRevision).then(refreshRevealState).catch(() => null);
  }, [currentHero?.id, heroShuffleState, heroPoolRevision, refreshRevealState]);

  useEffect(() => {
    if (!currentHeroVisualKey) return;
    heroFade.setValue(0.72);
    Animated.timing(heroFade, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [currentHeroVisualKey, heroFade]);

  useEffect(() => {
    if (!rewardedAdsEnabled || isPaidEntitled || !canShuffleHeroByLimit) {
      setHeroShuffleAdLoading(false);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    let pollTimer = null;
    const syncStatus = (label) => {
      const status = getHeroAdStatus();
      if (!cancelled) setHeroShuffleAdLoading(!!status.loading && !status.loaded);
      logHeroShuffleDebug(label, {
        loaded: status.loaded,
        loading: status.loading,
        phase: status.phase,
        reason: status.reason || null,
        remainingBefore: heroShuffleRemaining,
        alternateAvailable: hasAlternateHero && hasUnseenHero,
      });
      return status;
    };
    syncStatus('preload_before');
    loadHeroAd()
      .then(() => {
        const status = syncStatus('preload_requested');
        if (status.loaded || !status.loading) return;
        pollTimer = setInterval(() => {
          attempts += 1;
          const nextStatus = syncStatus('preload_poll');
          if (nextStatus.loaded || !nextStatus.loading || attempts >= 26) {
            clearInterval(pollTimer);
          }
        }, 500);
      })
      .catch((error) => {
        if (!cancelled) setHeroShuffleAdLoading(false);
        logHeroShuffleDebug('preload_error', { message: error?.message || null });
      });
    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [
    rewardedAdsEnabled,
    isPaidEntitled,
    canShuffleHeroByLimit,
    currentHero?.id,
    heroShuffleRemaining,
    hasAlternateHero,
    hasUnseenHero,
  ]);

  useEffect(() => {
    if (!currentHero?.id || lastHeroImpressionRef.current === currentHero.id) return;
    lastHeroImpressionRef.current = currentHero.id;
    track(Events.HERO_IMPRESSION, heroAnalyticsProps(currentHero, {
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
    }));
  }, [currentHero, dayNumber, isPaidEntitled]);

  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    const selectedUrl = getHeroUrl(currentHero);
    console.log('[hero:selected]', {
      requestedDateKey: heroPool?.dateKey || null,
      heroSource: heroPool?.source || (heroPool?.images?.length ? 'batch' : (heroImage ? 'legacy' : 'none')),
      heroPoolCount: heroPool?.images?.length || 0,
      assignedHeroesCount: heroImages.length,
      selectedHeroId: currentHero?.id || null,
      selectedHeroImageUrlPrefix: selectedUrl ? selectedUrl.slice(0, 96) : null,
      selectedHeroTitle: currentHero?.title || null,
      selectedHeroHeadline: currentHero?.headline || null,
      selectedHeroCTA: currentHero?.cta || currentHero?.CTA || null,
      fallbackUsed: heroPool?.source === 'legacy' || !heroPool?.images?.length,
      fallbackReason: heroPool?.source === 'legacy' ? 'legacy_hero_fallback' : (heroPool?.images?.length ? null : 'no_assigned_batch_hero'),
    });
  }, [currentHero, heroPool, heroImage, heroImages.length]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshUnlock(), refreshRevealState(), refresh()]);
    setRefreshing(false);
  }, [refreshUnlock, refreshRevealState, refresh]);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      const now = Date.now();
      if (now - lastFocusRefreshAt.current < 5000) return;
      lastFocusRefreshAt.current = now;
      refresh();
      refreshRevealState();
      refreshUnlock();
    }, [refresh, refreshRevealState, refreshUnlock])
  );

  useFocusEffect(
    useCallback(() => {
      if (!rewardedAdsEnabled || isPaidEntitled || !canShuffleHeroByLimit) return undefined;
      loadHeroAd().catch((error) => {
        logHeroShuffleDebug('preload_focus_error', { message: error?.message || null });
      });
      return undefined;
    }, [rewardedAdsEnabled, isPaidEntitled, canShuffleHeroByLimit, currentHero?.id])
  );

  const handleSettings = useCallback(() => {
    tap();
    router.push('/settings');
  }, []);

  const openPaywall = useCallback((category, entryPoint = 'home_locked_signal') => {
    setPaywall({ category, entryPoint });
    track(Events.PAYWALL_VIEWED, {
      entry_category: category,
      paywall_entry_point: entryPoint,
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
    });
  }, [dayNumber, isPaidEntitled]);

  const scrollToSignal = useCallback((category) => {
    const y = signalLayoutsRef.current[category];
    if (typeof y !== 'number') return false;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    pendingSignalFocusRef.current = null;
    return true;
  }, []);

  const requestSignalFocus = useCallback((category) => {
    if (!category) return;
    pendingSignalFocusRef.current = category;
    setHighlightedCategory(category);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedCategory(null);
      if (pendingSignalFocusRef.current === category) pendingSignalFocusRef.current = null;
    }, 1700);
    InteractionManager.runAfterInteractions(() => {
      if (scrollToSignal(category)) return;
      setTimeout(() => scrollToSignal(category), 220);
    });
  }, [scrollToSignal]);

  const handleSignalLayout = useCallback((category, event) => {
    signalLayoutsRef.current[category] = event.nativeEvent.layout.y;
    if (pendingSignalFocusRef.current === category) {
      setTimeout(() => scrollToSignal(category), 40);
    }
  }, [scrollToSignal]);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  const handleBuyDaily = useCallback(async () => {
    tap();
    await buyDaily();
    refreshUnlock();
  }, [buyDaily, refreshUnlock]);

  const handleBuyFull = useCallback(async () => {
    tap();
    await buyFull();
    refreshUnlock();
  }, [buyFull, refreshUnlock]);

  const handleFirstSignal = useCallback(async () => {
    if (!predictions || !firstCategory) return;
    tap();
    track(Events.FIRST_SIGNAL_CTA_TAP, cardAnalyticsProps(firstCategory, 0, predictions[firstCategory], {
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
    }));
    const result = await grantFreeSignal(firstCategory);
    await refreshRevealState();
    if (result.granted) {
      unlockHaptic();
      requestSignalFocus(firstCategory);
      track(Events.FREE_SIGNAL_REVEALED, cardAnalyticsProps(firstCategory, 0, predictions[firstCategory], {
        user_day_number: dayNumber,
        is_paid_entitled: isPaidEntitled,
      }));
    }
  }, [predictions, firstCategory, dayNumber, isPaidEntitled, refreshRevealState, requestSignalFocus]);

  const grantSignalWithAd = useCallback(async (category, index) => {
    if (!rewardedAdsEnabled) {
      Alert.alert('Ad unavailable', 'This signal did not change. Try again in a moment.');
      return;
    }
    track(Events.LOCKED_SIGNAL_AD_STARTED, cardAnalyticsProps(category, index, predictions?.[category], {
      ad_placement: 'locked_signal',
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
    }));
    const result = await showRewardedAd({ placement: 'locked_signal', metadata: { category } });
    if (!result.rewarded) {
      track(Events.LOCKED_SIGNAL_AD_FAILED, cardAnalyticsProps(category, index, predictions?.[category], {
        ad_placement: 'locked_signal',
        reason: result.reason || 'not_rewarded',
      }));
      Alert.alert('Ad unavailable', 'This signal did not change. Try again in a moment.');
      return;
    }
    await grantSignalReveal(category, 'ad');
    await refreshRevealState();
    unlockHaptic();
    requestSignalFocus(category);
    track(Events.LOCKED_SIGNAL_AD_COMPLETED, cardAnalyticsProps(category, index, predictions?.[category], {
      ad_placement: 'locked_signal',
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
    }));
  }, [rewardedAdsEnabled, predictions, dayNumber, isPaidEntitled, refreshRevealState, requestSignalFocus]);

  const handleSignalAdPress = useCallback((category, index) => {
    track(Events.LOCKED_SIGNAL_TAP, cardAnalyticsProps(category, index, predictions?.[category], {
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
    }));
    Alert.alert(
      'She can draw this one now.',
      'Watch an ad to reveal exactly this signal.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Watch ad', onPress: () => grantSignalWithAd(category, index) },
      ],
    );
  }, [grantSignalWithAd, predictions, dayNumber, isPaidEntitled]);

  const grantDeeperWithAd = useCallback(async (category, index) => {
    if (!rewardedAdsEnabled) {
      Alert.alert('Ad unavailable', 'This card did not change. Try again in a moment.');
      return;
    }
    track(Events.DEEPER_MEANING_AD_STARTED, cardAnalyticsProps(category, index, predictions?.[category], {
      ad_placement: 'deeper_meaning',
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
    }));
    const result = await showRewardedAd({ placement: 'deeper_meaning', metadata: { category } });
    if (!result.rewarded) {
      track(Events.DEEPER_MEANING_AD_FAILED, cardAnalyticsProps(category, index, predictions?.[category], {
        ad_placement: 'deeper_meaning',
        reason: result.reason || 'not_rewarded',
      }));
      Alert.alert('Ad unavailable', 'This card did not change. Try again in a moment.');
      return;
    }
    await grantDeeperMeaning(category, 'ad');
    await refreshRevealState();
    unlockHaptic();
    requestSignalFocus(category);
    track(Events.DEEPER_MEANING_AD_COMPLETED, cardAnalyticsProps(category, index, predictions?.[category], {
      ad_placement: 'deeper_meaning',
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
    }));
  }, [rewardedAdsEnabled, predictions, dayNumber, isPaidEntitled, refreshRevealState, requestSignalFocus]);

  const handleDeeperAdPress = useCallback((category, index) => {
    track(Events.DEEPER_MEANING_TAP, cardAnalyticsProps(category, index, predictions?.[category], {
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
    }));
    Alert.alert(
      "There's more under this card.",
      'Watch an ad to unlock the deeper meaning.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Watch ad', onPress: () => grantDeeperWithAd(category, index) },
      ],
    );
  }, [grantDeeperWithAd, predictions, dayNumber, isPaidEntitled]);

  const getNextHero = useCallback(() => {
    const seen = new Set(seenHeroIds);
    return heroImages.find((img) => img.id !== currentHero?.id && !seen.has(img.id)) || null;
  }, [seenHeroIds, heroImages, currentHero?.id]);

  const changeHero = useCallback(async (source) => {
    const next = getNextHero();
    if (!next) {
      Alert.alert('No other reader ready', 'There are no more reader images available right now.');
      return false;
    }
    logHeroShuffleDebug('shuffle_request', {
      source,
      previousHeroId: currentHero?.id || null,
      nextHeroId: next.id || null,
      nextMediaType: next.mediaType || 'image',
    });
    const nextState = await recordHeroShuffle(next.id, source, heroPoolRevision);
    await refreshRevealState();
    unlockHaptic();
    logHeroShuffleDebug('shuffle_response', {
      source,
      changed: true,
      rewardedShuffles: nextState?.rewardedShuffles || 0,
      paidShuffles: nextState?.paidShuffles || 0,
    });
    track(Events.HERO_IMAGE_CHANGED, heroAnalyticsProps(next, {
      previous_hero_image_id: currentHero?.id || null,
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
      ad_placement: source === 'ad' ? 'hero_shuffle' : null,
    }));
    return true;
  }, [getNextHero, refreshRevealState, currentHero?.id, dayNumber, isPaidEntitled, heroPoolRevision]);

  const handleHeroShuffle = useCallback(() => {
    tap();
    track(Events.HERO_SHUFFLE_TAP, heroAnalyticsProps(currentHero, {
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
      remaining: heroShuffleRemaining,
    }));
    logHeroShuffleDebug('tap', {
      currentHeroId: currentHero?.id || null,
      currentMediaType: currentHero?.mediaType || 'image',
      heroPoolCount: heroImages.length,
      hasAlternateHero,
      hasUnseenHero,
      remainingBefore: heroShuffleRemaining,
      rewardedAdsEnabled,
      isPaidEntitled,
    });
    logHeroShuffleDebug(`preconditions remaining=${heroShuffleRemaining} eligible=${heroImages.length} rewardedEnabled=${rewardedAdsEnabled}`, {
      loading,
      canShuffleHeroByLimit,
      inFlight: heroShuffleAdInFlightRef.current,
    });

    if (heroImages.length <= 1 || !hasAlternateHero || !hasUnseenHero) {
      Alert.alert('No other reader ready', 'There are no more reader images available right now.');
      return;
    }

    if (heroShuffleRemaining <= 0 || seenHeroIds.length >= maxHeroImages) {
      Alert.alert('No more reader shuffles today', 'No more reader shuffles today.');
      return;
    }

    if (!canShuffleHeroByLimit) {
      Alert.alert('No other reader ready', 'There are no more reader images available right now.');
      return;
    }

    if (isPaidEntitled) {
      changeHero('paid');
      return;
    }

    if (!rewardedAdsEnabled) {
      Alert.alert('Ad unavailable', 'The reader image did not change. Try again in a moment.');
      return;
    }
    if (heroShuffleAdInFlightRef.current) return;

    Alert.alert(
      "Shuffle today's reader?",
      `Watch one short ad to change the reader image. ${shuffleRemainingText}`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Watch ad',
          onPress: async () => {
            if (heroShuffleAdInFlightRef.current) return;
            const status = getHeroAdStatus();
            logHeroShuffleDebug('ad_status_before_show', {
              loaded: status.loaded,
              loading: status.loading,
              phase: status.phase,
              reason: status.reason || null,
              remainingBefore: heroShuffleRemaining,
            });

            if (status.phase === 'loading') {
              setHeroShuffleAdLoading(true);
              track(Events.HERO_SHUFFLE_AD_FAILED, heroAnalyticsProps(currentHero, {
                ad_placement: 'hero_shuffle',
                reason: 'ad_loading',
              }));
              Alert.alert('Ad still loading', 'The reader image did not change. Try again in a moment.');
              return;
            }

            if (status.phase !== 'loaded') {
              const nextStatus = await loadHeroAd({ forceFresh: true });
              setHeroShuffleAdLoading(!!nextStatus.loading && !nextStatus.loaded);
              track(Events.HERO_SHUFFLE_AD_FAILED, heroAnalyticsProps(currentHero, {
                ad_placement: 'hero_shuffle',
                reason: nextStatus.phase === 'unavailable'
                  ? (nextStatus.reason || 'ad_unavailable')
                  : (status.reason || status.phase || 'ad_not_ready'),
              }));
              if (nextStatus.phase === 'unavailable') {
                Alert.alert('Ad unavailable', 'The reader image did not change. Try again in a moment.');
              } else {
                Alert.alert('Ad still loading', 'The reader image did not change. Try again in a moment.');
              }
              return;
            }

            heroShuffleAdInFlightRef.current = true;
            setHeroShuffleAdBusy(true);
            setHeroShuffleAdLoading(false);
            track(Events.HERO_SHUFFLE_AD_STARTED, heroAnalyticsProps(currentHero, {
              ad_placement: 'hero_shuffle',
              user_day_number: dayNumber,
              is_paid_entitled: isPaidEntitled,
            }));
            try {
              const result = await showHeroAd({ metadata: { heroId: currentHero?.id } });
              logHeroShuffleDebug('ad_result', {
                rewarded: !!result.rewarded,
                reason: result.reason || null,
                source: result.source || null,
                remainingBefore: heroShuffleRemaining,
              });
              if (!result.rewarded) {
                const copy = heroRewardAlertForResult(result);
                track(Events.HERO_SHUFFLE_AD_FAILED, heroAnalyticsProps(currentHero, {
                  ad_placement: 'hero_shuffle',
                  reason: result.reason || 'not_rewarded',
                }));
                Alert.alert(copy.title, copy.body);
                loadHeroAd().catch(() => null);
                return;
              }

              logHeroShuffleDebug('reward earned, calling shuffle', {
                remainingBefore: heroShuffleRemaining,
                currentHeroId: currentHero?.id || null,
              });
              const changed = await changeHero('ad');
              if (changed) {
                logHeroShuffleDebug('shuffle success', { remainingBefore: heroShuffleRemaining });
                track(Events.HERO_SHUFFLE_AD_COMPLETED, heroAnalyticsProps(currentHero, {
                  ad_placement: 'hero_shuffle',
                  user_day_number: dayNumber,
                  is_paid_entitled: isPaidEntitled,
                }));
              } else {
                logHeroShuffleDebug('shuffle failed', { reason: 'no_alternate_hero' });
                loadHeroAd().catch(() => null);
              }
            } catch (error) {
              logHeroShuffleDebug('shuffle failed', { message: error?.message || null });
              Alert.alert('Ad unavailable', 'The reader image did not change. Try again in a moment.');
              loadHeroAd({ forceFresh: true }).catch(() => null);
            } finally {
              heroShuffleAdInFlightRef.current = false;
              setHeroShuffleAdBusy(false);
              setHeroShuffleAdLoading(false);
            }
          },
        },
      ],
    );
  }, [
    currentHero,
    dayNumber,
    isPaidEntitled,
    rewardedAdsEnabled,
    shuffleRemainingText,
    changeHero,
    heroImages.length,
    hasAlternateHero,
    hasUnseenHero,
    heroShuffleRemaining,
    seenHeroIds.length,
    maxHeroImages,
    canShuffleHeroByLimit,
    loading,
  ]);

  const vibe = getDailyVibe();
  const moment = getDailyMoment();
  const watchFor = getDailyWatchFor();
  const heroTitle = isHumanReadableHeroText(currentHero?.title || currentHero?.name)
    ? normalizeHeroCopy(currentHero?.title || currentHero?.name)
    : null;
  const heroMood = isHumanReadableHeroText(currentHero?.readerMood)
    ? normalizeHeroCopy(currentHero.readerMood)
    : (heroTitle || "Today's reader");
  const heroHeadline = isHumanReadableHeroText(currentHero?.headline)
      && !isGenericHeroFallbackHeadline(currentHero?.headline, currentHero?.readerMood)
    ? normalizeHeroCopy(currentHero.headline)
    : "Your reader has opened today's signal.";
  const heroCta = normalizeHeroCopy(currentHero?.cta || currentHero?.CTA) || 'Draw my first signal';
  const activeShuffleCtaText = width < 360 ? 'Shuffle reader' : 'Shuffle reader image';
  const shuffleCtaText = heroShuffleAdBusy
    ? 'Waiting for ad'
    : (heroShuffleAdLoading && !isPaidEntitled && canShuffleHero ? 'Ad loading...' : (canShuffleHero ? activeShuffleCtaText : 'No more reader shuffles today'));
  const showHeroShuffleControl = heroImages.length > 1 && (isPaidEntitled || rewardedAdsEnabled);
  const footerOffers = [
    todayUnlockEnabled ? `Unlock today ${dailyPrice}` : null,
    thirtyDayUnlockEnabled ? `Open 30 days ${fullPrice}` : null,
  ].filter(Boolean);
  const hideBannerAd = paywall !== null || isPaidEntitled;

  return (
    <ScreenShell>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <StarsBackground />

      <LinearGradient
        colors={['rgba(201,169,110,0.07)', 'rgba(7,8,15,0)']}
        style={styles.topGlow}
        pointerEvents="none"
      />

      <TouchableOpacity
        onPress={handleSettings}
        style={styles.settingsBtn}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        activeOpacity={0.7}
      >
        <Text style={styles.settingsIcon}>⚙</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={palette.textMuted}
            colors={[palette.textMuted]}
          />
        }
      >
        <DayHeader unlocked={unlocked} streak={streak} />

        <Animated.View style={{ opacity: heroFade }}>
          <HeroImage
            source={currentHero?.url}
            mediaType={currentHero?.mediaType || 'image'}
            posterUrl={currentHero?.posterUrl}
            version={heroPool?.revision || currentHero?.revision || currentHero?.updatedAt}
            fallbackEnabled={monetizationConfig.fallbackHeroEnabled}
          />
        </Animated.View>

        <View style={styles.readerBlock}>
          <Text style={styles.readerMood}>{heroMood}</Text>
          <Text style={styles.readerHeadline}>{heroHeadline}</Text>
          {currentHero?.tags?.length ? (
            <Text style={styles.readerTags}>{currentHero.tags.slice(0, 5).join(' · ')}</Text>
          ) : null}

          {!hasAnyReveal && !loading ? (
            <TouchableOpacity activeOpacity={0.86} onPress={handleFirstSignal} style={styles.primaryCta}>
              <LinearGradient
                colors={['rgba(201,169,110,0.25)', 'rgba(201,169,110,0.10)']}
                style={styles.primaryCtaGradient}
              >
                <Text style={styles.primaryCtaText}>{heroCta}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : null}

          {showHeroShuffleControl ? (
            <>
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={handleHeroShuffle}
                disabled={purchasing || heroShuffleAdBusy || !canShuffleHero}
                style={[styles.shuffleCta, (!canShuffleHero || heroShuffleAdBusy) && styles.shuffleCtaDisabled]}
              >
                <Feather name="shuffle" size={14} color={canShuffleHero && !heroShuffleAdBusy ? palette.accent : palette.textMuted} style={styles.shuffleIcon} />
                <Text style={styles.shuffleCtaText}>{shuffleCtaText}</Text>
              </TouchableOpacity>
              <Text style={styles.shuffleHint}>{shuffleRemainingText}</Text>
            </>
          ) : null}
        </View>

        <TodaysSky vibe={vibe} moment={moment} watchFor={watchFor} />

        <SafeBannerAd hidden={hideBannerAd} />

        {loading && !predictions ? (
          <>
            <Text style={styles.loadingLabel}>DRAWING YOUR SIGNALS...</Text>
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </>
        ) : !hasAnyReveal ? (
          <View style={styles.waitingBlock}>
            <Text style={styles.waitingTitle}>The first signal is close.</Text>
            <Text style={styles.waitingText}>
              Let the reader draw one card for free today. The rest stay hidden until you choose.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>
              {isPaidEntitled ? "TODAY'S FOUR SIGNALS" : "TODAY'S REVEALED SIGNALS"}
            </Text>
            {!isPaidEntitled && (
              <Text style={styles.sectionSub}>
                {lockedCount === 3
                  ? 'Three more signals are still hidden.'
                  : `${lockedCount} more signal${lockedCount === 1 ? '' : 's'} still hidden.`}
              </Text>
            )}

            {categoryOrder.map((cat, index) => {
              const isRevealed = isPaidEntitled || !!revealMap[cat];
              const isDeepUnlocked = isPaidEntitled || !!deeperMap[cat];
              return (
                <View key={cat} onLayout={(event) => handleSignalLayout(cat, event)}>
                  <SignalCard
                    category={cat}
                    prediction={predictions?.[cat]}
                    isFree={false}
                    isUnlocked={isPaidEntitled}
                    isRevealed={isRevealed}
                    isDeepUnlocked={isDeepUnlocked}
                    isPaidEntitled={isPaidEntitled}
                    deeperEnabled={monetizationConfig.deeperMeaningEnabled}
                    rewardedAdsEnabled={rewardedAdsEnabled}
                    todayUnlockEnabled={todayUnlockEnabled}
                    thirtyDayUnlockEnabled={thirtyDayUnlockEnabled}
                    dailyPrice={dailyPrice}
                    fullPrice={fullPrice}
                    highlighted={highlightedCategory === cat}
                    onUnlockPress={() => openPaywall(cat, 'locked_signal_header')}
                    onWatchAdPress={() => handleSignalAdPress(cat, index)}
                    onBuyDailyPress={handleBuyDaily}
                    onBuyFullPress={handleBuyFull}
                    onDeeperAdPress={() => handleDeeperAdPress(cat, index)}
                  />
                </View>
              );
            })}

            {!isPaidEntitled && footerOffers.length > 0 && (
              <View style={styles.footerBlock}>
                <Text style={styles.footerTitle}>The first signal found you.</Text>
                <Text style={styles.footerNote}>
                  {footerOffers.join(' · ')}
                </Text>
              </View>
            )}
          </>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>

      <PaywallSheet
        visible={paywall !== null}
        onDismiss={() => setPaywall(null)}
        entryCategory={paywall?.category}
        entryPoint={paywall?.entryPoint}
        onRewardPress={
          rewardedAdsEnabled && paywall?.category
            ? () => {
                const index = categoryOrder.indexOf(paywall.category);
                setPaywall(null);
                handleSignalAdPress(paywall.category, index);
              }
            : null
        }
        rewardLabel="Or reveal one more with an ad"
        todayUnlockEnabled={todayUnlockEnabled}
        thirtyDayUnlockEnabled={thirtyDayUnlockEnabled}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 240,
    zIndex: 0,
    pointerEvents: 'none',
  },
  settingsBtn: {
    position: 'absolute',
    top: 48,
    right: spacing.lg,
    zIndex: 50,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: palette.glassBorder,
  },
  settingsIcon: {
    color: palette.textSub,
    fontSize: 18,
    lineHeight: 20,
  },
  scroll: { flex: 1, zIndex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  readerBlock: {
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  readerTitle: {
    ...type.bodyMed,
    color: palette.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  readerMood: {
    ...type.kicker,
    color: palette.accent,
    letterSpacing: 2.5,
    marginBottom: spacing.xs,
  },
  readerHeadline: {
    ...type.title,
    color: palette.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  readerTags: {
    ...type.caption,
    color: palette.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primaryCta: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.45)',
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  primaryCtaGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryCtaText: {
    ...type.bodyMed,
    color: palette.accent,
    textAlign: 'center',
  },
  shuffleCta: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.36)',
    backgroundColor: 'rgba(201,169,110,0.055)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffleCtaDisabled: {
    opacity: 0.56,
    borderColor: palette.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  shuffleIcon: {
    marginRight: spacing.xs,
    opacity: 0.92,
  },
  shuffleCtaText: {
    ...type.caption,
    color: palette.text,
    fontWeight: '700',
    textAlign: 'center',
  },
  shuffleHint: {
    ...type.caption,
    color: palette.textMuted,
    fontSize: 11.5,
    marginTop: spacing.xs,
    opacity: 0.72,
    textAlign: 'center',
  },
  waitingBlock: {
    borderWidth: 1,
    borderColor: palette.glassBorder,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  waitingTitle: {
    ...type.heading,
    color: palette.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  waitingText: {
    ...type.caption,
    color: palette.textSub,
    textAlign: 'center',
  },
  loadingLabel: {
    ...type.kicker,
    color: palette.accent,
    marginBottom: spacing.md,
    textAlign: 'center',
    letterSpacing: 3,
  },
  sectionLabel: {
    ...type.kicker,
    color: palette.accent,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    letterSpacing: 2.5,
  },
  sectionSub: {
    ...type.caption,
    color: palette.textMuted,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  footerBlock: {
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.18)',
    backgroundColor: 'rgba(201,169,110,0.05)',
  },
  footerTitle: {
    ...type.bodyMed,
    color: palette.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  footerNote: {
    ...type.caption,
    color: palette.accent,
    textAlign: 'center',
  },
  bottomSpace: { height: spacing.xxl },
});
