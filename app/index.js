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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { showRewardedAd } from '@/services/rewardedAdService';
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
  return hero?.imageUrl || hero?.url || hero?.uri || hero?.src || null;
}

function normalizeHero(hero) {
  const url = getHeroUrl(hero);
  if (!hero || !url) return null;
  return {
    ...hero,
    url,
    imageUrl: url,
    cta: hero.cta || hero.CTA || hero.ctaCopy || null,
  };
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
  const [paywall, setPaywall] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastFocusRefreshAt = useRef(0);
  const hasFocusedOnce = useRef(false);
  const lastHeroImpressionRef = useRef(null);
  const scrollRef = useRef(null);
  const signalLayoutsRef = useRef({});
  const pendingSignalFocusRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const [highlightedCategory, setHighlightedCategory] = useState(null);

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
  const heroPoolRevision = heroPool?.revision || heroPool?.updatedAt || 'legacy';

  const maxHeroImages = Math.min(
    heroImages.length || 1,
    monetizationConfig.maxHeroImagesPerDay || 5,
  );
  const maxHeroShuffles = Math.min(
    monetizationConfig.maxHeroShufflesPerDay || 4,
    Math.max(0, maxHeroImages - 1),
  );
  const seenHeroIds = heroShuffleState?.seenHeroIds || [];
  const totalHeroShuffles = (heroShuffleState?.rewardedShuffles || 0) + (heroShuffleState?.paidShuffles || 0);
  const heroShuffleRemaining = Math.max(0, maxHeroShuffles - totalHeroShuffles);
  const canShuffleHero = heroImages.length > 1 && heroShuffleRemaining > 0 && seenHeroIds.length < maxHeroImages;

  useEffect(() => {
    if (!currentHero?.id || !heroShuffleState) return;
    if (heroShuffleState.currentHeroId === currentHero.id) return;
    setCurrentHeroForToday(currentHero.id, heroPoolRevision).then(refreshRevealState).catch(() => null);
  }, [currentHero?.id, heroShuffleState, heroPoolRevision, refreshRevealState]);

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
    if (!monetizationConfig.rewardedAdsEnabled) {
      Alert.alert('Ad unavailable', 'Try again in a little while, or unlock today.');
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
      Alert.alert('Ad unavailable', 'No reward was granted. Please try again.');
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
  }, [monetizationConfig.rewardedAdsEnabled, predictions, dayNumber, isPaidEntitled, refreshRevealState, requestSignalFocus]);

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
    if (!monetizationConfig.rewardedAdsEnabled) {
      Alert.alert('Ad unavailable', 'Try again in a little while, or unlock today.');
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
      Alert.alert('Ad unavailable', 'No reward was granted. Please try again.');
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
  }, [monetizationConfig.rewardedAdsEnabled, predictions, dayNumber, isPaidEntitled, refreshRevealState, requestSignalFocus]);

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
      Alert.alert("Today's hero set is complete.", 'You have seen the available readers for today.');
      return;
    }
    await recordHeroShuffle(next.id, source, heroPoolRevision);
    await refreshRevealState();
    unlockHaptic();
    track(Events.HERO_IMAGE_CHANGED, heroAnalyticsProps(next, {
      previous_hero_image_id: currentHero?.id || null,
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
      ad_placement: source === 'ad' ? 'hero_shuffle' : null,
    }));
  }, [getNextHero, refreshRevealState, currentHero?.id, dayNumber, isPaidEntitled, heroPoolRevision]);

  const handleHeroShuffle = useCallback(() => {
    tap();
    track(Events.HERO_SHUFFLE_TAP, heroAnalyticsProps(currentHero, {
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
      remaining: heroShuffleRemaining,
    }));

    if (!canShuffleHero) {
      Alert.alert("Today's hero set is complete.", 'You have seen the available readers for today.');
      return;
    }

    if (isPaidEntitled) {
      changeHero('paid');
      return;
    }

    Alert.alert(
      'Watch an ad to draw another reader.',
      `You can draw ${heroShuffleRemaining} more reader${heroShuffleRemaining === 1 ? '' : 's'} today.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Watch ad',
          onPress: async () => {
            track(Events.HERO_SHUFFLE_AD_STARTED, heroAnalyticsProps(currentHero, {
              ad_placement: 'hero_shuffle',
              user_day_number: dayNumber,
              is_paid_entitled: isPaidEntitled,
            }));
            const result = await showRewardedAd({ placement: 'hero_shuffle', metadata: { heroId: currentHero?.id } });
            if (!result.rewarded) {
              track(Events.HERO_SHUFFLE_AD_FAILED, heroAnalyticsProps(currentHero, {
                ad_placement: 'hero_shuffle',
                reason: result.reason || 'not_rewarded',
              }));
              Alert.alert('Ad unavailable', 'No reader was drawn. Please try again.');
              return;
            }
            track(Events.HERO_SHUFFLE_AD_COMPLETED, heroAnalyticsProps(currentHero, {
              ad_placement: 'hero_shuffle',
              user_day_number: dayNumber,
              is_paid_entitled: isPaidEntitled,
            }));
            changeHero('ad');
          },
        },
      ],
    );
  }, [currentHero, dayNumber, isPaidEntitled, heroShuffleRemaining, canShuffleHero, changeHero]);

  const vibe = getDailyVibe();
  const moment = getDailyMoment();
  const watchFor = getDailyWatchFor();
  const heroTitle = currentHero?.title || currentHero?.name || null;
  const heroHeadline = currentHero?.headline || 'Today has a reader';
  const heroMood = currentHero?.readerMood || 'The Mirror';
  const heroCta = currentHero?.cta || 'Let her draw your first signal';
  const shuffleCtaText = canShuffleHero ? 'Draw another reader' : "Today's readers are complete";

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

        <HeroImage
          source={currentHero?.url}
          version={heroPool?.revision || currentHero?.revision || currentHero?.updatedAt}
          fallbackEnabled={monetizationConfig.fallbackHeroEnabled}
        />

        <View style={styles.readerBlock}>
          {heroTitle ? (
            <Text style={styles.readerTitle}>{heroTitle}</Text>
          ) : null}
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

          <TouchableOpacity
            activeOpacity={0.78}
            onPress={handleHeroShuffle}
            disabled={purchasing}
            style={[styles.shuffleCta, !canShuffleHero && styles.shuffleCtaDisabled]}
          >
            <Text style={styles.shuffleCtaText}>{shuffleCtaText}</Text>
          </TouchableOpacity>
        </View>

        <TodaysSky vibe={vibe} moment={moment} watchFor={watchFor} />

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

            {!isPaidEntitled && (
              <View style={styles.footerBlock}>
                <Text style={styles.footerTitle}>The first signal found you.</Text>
                <Text style={styles.footerNote}>
                  Reveal all today · {dailyPrice} · Open 30 days · {fullPrice}
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
          paywall?.category
            ? () => {
                const index = categoryOrder.indexOf(paywall.category);
                setPaywall(null);
                handleSignalAdPress(paywall.category, index);
              }
            : null
        }
        rewardLabel="Or reveal one more with an ad"
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  shuffleCtaDisabled: {
    opacity: 0.55,
  },
  shuffleCtaText: {
    ...type.caption,
    color: palette.textSub,
    fontWeight: '700',
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
