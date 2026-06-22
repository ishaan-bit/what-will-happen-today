import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { router, useFocusEffect } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { DayHeader } from '@/components/DayHeader';
import { TarotCard } from '@/components/TarotCard';
import { SignalCard } from '@/components/SignalCard';
import { PaywallSheet } from '@/components/PaywallSheet';
import { SkeletonCard } from '@/components/SkeletonCard';
import { StarsBackground } from '@/components/StarsBackground';
import { SafeBannerAd } from '@/components/SafeBannerAd';
import { TodaysSky } from '@/components/TodaysSky';
import { usePredictions } from '@/hooks/usePredictions';
import { useBilling } from '@/hooks/useBilling';
import { PRODUCT_DAILY, PRODUCT_FULL } from '@/services/billingService';
import { getInstallSalt, recordCardShuffle } from '@/services/storageService';
import { showHeroShuffleRewardedAd, preloadHeroShuffleRewardedAd } from '@/services/heroShuffleRewardedAd';
import { drawDailySpreadByCategory, tarotBlockFromDraw } from '@/utils/tarotDraw';
import {
  getCategoryOrder,
  getDailyVibe,
  getDailyMoment,
  getDailyWatchFor,
} from '@/utils/freeCategory';
import { getTodayKey } from '@/utils/dateUtils';
import { palette, spacing, type, radius } from '@/utils/theme';
import { track, Events } from '@/services/analyticsService';
import { tap, unlock as unlockHaptic } from '@/utils/haptics';

function getHeroUrl(hero) {
  return hero?.videoUrl || hero?.mediaUrl || hero?.imageUrl || hero?.url || hero?.uri || hero?.src || null;
}

function normalizeHero(hero) {
  const url = getHeroUrl(hero);
  if (!hero || !url) return null;
  const mediaType = hero.mediaType === 'video' || hero.type === 'video' ? 'video' : 'image';
  return { ...hero, url, mediaType, posterUrl: hero.posterUrl || null };
}

export default function HomeScreen() {
  const {
    predictions,
    heroPool,
    heroImage,
    monetizationConfig,
    revealState,
    cardShuffleState,
    entitlement,
    unlocked,
    loading,
    refreshUnlock,
    refreshRevealState,
    refresh,
    freeCategory,
    streak,
    dayNumber,
    inFreeWindow,
  } = usePredictions();

  const { getPrice, buyDaily, buyFull, purchasing } = useBilling();
  const [paywall, setPaywall] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [installSalt, setInstallSalt] = useState('anon');
  const adInFlightRef = useRef(false);
  const lastFocusRefreshAt = useRef(0);
  const hasFocusedOnce = useRef(false);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => null);
  }, [loading]);

  useEffect(() => {
    getInstallSalt().then((s) => s && setInstallSalt(s)).catch(() => null);
  }, []);

  const dailyPrice = getPrice(PRODUCT_DAILY);
  const fullPrice = getPrice(PRODUCT_FULL);

  const cardBasedModel = monetizationConfig.cardBasedModel !== false;
  const bannerEnabled = monetizationConfig.bannerAdEnabled !== false;
  const deeperEnabled = monetizationConfig.deeperMeaningEnabled !== false;
  const todayUnlockEnabled = monetizationConfig.todayUnlockEnabled !== false;
  const thirtyDayUnlockEnabled = monetizationConfig.thirtyDayUnlockEnabled !== false;

  const isPaidEntitled = unlocked || entitlement?.active;
  const isThirtyDay = !!entitlement?.thirtyDay;

  // Shuffle = re-draw the spread + reveal all four of that draw.
  //   Free   -> rewarded ad, capped per day.
  //   30-day -> unlimited, ad-free.
  //   Daily  -> already sees today's full spread, no shuffle.
  const shuffleSeed = cardShuffleState?.seed || 0;
  const shuffleCount = cardShuffleState?.count || 0;
  const shuffleRevealed = !!cardShuffleState?.revealed;
  const fullReveal = isPaidEntitled || inFreeWindow || shuffleRevealed;

  const rewardedAdsEnabled = monetizationConfig.rewardedAdsEnabled !== false;
  const maxShuffles = monetizationConfig.maxRewardedShufflesPerDay ?? 3;
  const freeShufflesLeft = Math.max(0, maxShuffles - shuffleCount);
  const canShuffleUnlimited = isThirtyDay;
  const canShuffleRewarded = !isPaidEntitled && rewardedAdsEnabled && freeShufflesLeft > 0;
  const showShuffle = canShuffleUnlimited || (!isPaidEntitled && rewardedAdsEnabled);

  const revealMap = revealState?.revealedSignals || {};
  const categoryOrder = useMemo(() => getCategoryOrder(freeCategory), [freeCategory]);

  const heroImages = useMemo(() => {
    const poolImages = Array.isArray(heroPool?.images) ? heroPool.images : [];
    const source = poolImages.length ? poolImages : (getHeroUrl(heroImage) ? [heroImage] : []);
    return source.map(normalizeHero).filter(Boolean);
  }, [heroPool, heroImage]);

  // A fresh deterministic draw for each shuffle. seed 0 keeps the server-attached
  // daily draw (no client recompute, no flicker on first paint).
  const shuffledSpread = useMemo(() => {
    if (!shuffleSeed) return null;
    return drawDailySpreadByCategory({ installSalt, dateKey: getTodayKey(), bucket: String(shuffleSeed) });
  }, [installSalt, shuffleSeed]);

  const cards = useMemo(() => categoryOrder.map((cat, i) => {
    const isFreeCard = cat === freeCategory;
    const revealed = fullReveal || isFreeCard || !!revealMap[cat];
    const len = heroImages.length;
    const hero = len ? heroImages[(i + shuffleSeed) % len] : null;
    const base = predictions?.[cat];
    const prediction = (shuffledSpread && base)
      ? { ...base, tarot: tarotBlockFromDraw(shuffledSpread[cat]) }
      : base;
    return { category: cat, prediction, hero, isFree: isFreeCard, revealed, position: i };
  }), [categoryOrder, freeCategory, fullReveal, revealMap, heroImages, predictions, shuffleSeed, shuffledSpread]);

  const lockedCount = cards.filter((c) => !c.revealed).length;

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

  // Preload the rewarded shuffle ad while a free user still has shuffles left.
  useFocusEffect(
    useCallback(() => {
      if (!canShuffleRewarded) return;
      preloadHeroShuffleRewardedAd({ forceFresh: false }).catch(() => null);
    }, [canShuffleRewarded])
  );

  const handleSettings = useCallback(() => {
    tap();
    router.push('/settings');
  }, []);

  const openPaywall = useCallback((category, entryPoint = 'home_locked_card') => {
    setPaywall({ category: category || null, entryPoint });
    track(Events.PAYWALL_VIEWED, {
      entry_category: category || null,
      paywall_entry_point: entryPoint,
      user_day_number: dayNumber,
      is_paid_entitled: isPaidEntitled,
    });
  }, [dayNumber, isPaidEntitled]);

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

  const handleShuffle = useCallback(async () => {
    if (adInFlightRef.current || shuffling) return;
    tap();

    // 30-day holders: unlimited, ad-free re-draw.
    if (canShuffleUnlimited) {
      setShuffling(true);
      try {
        const next = await recordCardShuffle('paid');
        await refreshRevealState();
        unlockHaptic();
        track(Events.HERO_IMAGE_CHANGED, { placement: 'card_shuffle', tier: 'thirty_day', seed: next.seed });
      } finally {
        setShuffling(false);
      }
      return;
    }

    // Free users: rewarded, capped.
    if (!canShuffleRewarded) {
      openPaywall(null, 'shuffle_cap');
      return;
    }
    adInFlightRef.current = true;
    setShuffling(true);
    try {
      track(Events.HERO_SHUFFLE_AD_STARTED, { placement: 'card_shuffle', user_day_number: dayNumber });
      const result = await showHeroShuffleRewardedAd({ metadata: { placement: 'card_shuffle' } });
      if (!result.rewarded) {
        track(Events.HERO_SHUFFLE_AD_FAILED, { reason: result.reason || 'not_rewarded' });
        preloadHeroShuffleRewardedAd({ forceFresh: true }).catch(() => null);
        Alert.alert("The deck didn't shuffle", "The ad wasn't ready. Try again in a moment.");
        return;
      }
      const next = await recordCardShuffle('ad');
      await refreshRevealState();
      unlockHaptic();
      track(Events.HERO_SHUFFLE_AD_COMPLETED, { placement: 'card_shuffle', seed: next.seed, user_day_number: dayNumber });
    } catch (err) {
      Alert.alert('Something went wrong', "The deck didn't shuffle. Try again in a moment.");
    } finally {
      adInFlightRef.current = false;
      setShuffling(false);
    }
  }, [canShuffleUnlimited, canShuffleRewarded, shuffling, dayNumber, openPaywall, refreshRevealState]);

  const vibe = getDailyVibe();
  const moment = getDailyMoment();
  const watchFor = getDailyWatchFor();
  const hideBannerAd = paywall !== null || isPaidEntitled || !bannerEnabled;

  const spreadSubtitle = isThirtyDay
    ? 'All four cards are face-up. Shuffle the deck anytime for a fresh draw.'
    : isPaidEntitled
      ? 'All four cards are face-up for you today.'
      : inFreeWindow
        ? 'Your first days are open — every card is face-up.'
        : shuffleRevealed
          ? 'Your shuffled spread is open.'
          : lockedCount > 0
            ? `One card is face-up. ${lockedCount} more wait face-down.`
            : 'Your spread is open today.';

  const shuffleLabel = shuffling
    ? 'Shuffling the deck…'
    : canShuffleUnlimited
      ? '⇄  Shuffle the deck · unlimited'
      : canShuffleRewarded
        ? `⇄  Shuffle the deck — watch an ad · ${freeShufflesLeft} left`
        : 'No more shuffles today';
  const shuffleDisabled = shuffling || (!canShuffleUnlimited && !canShuffleRewarded);

  return (
    <ScreenShell>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <StarsBackground />

      <LinearGradient
        colors={['rgba(201,169,110,0.08)', 'rgba(7,8,15,0)']}
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
        <DayHeader unlocked={isPaidEntitled} streak={streak} />

        <View style={styles.spreadIntro}>
          <Text style={styles.spreadKicker}>YOUR FOUR-CARD SPREAD</Text>
          <Text style={styles.spreadSub}>{spreadSubtitle}</Text>
        </View>

        <TodaysSky vibe={vibe} moment={moment} watchFor={watchFor} />

        <SafeBannerAd hidden={hideBannerAd} />

        {loading && !predictions ? (
          <>
            <Text style={styles.loadingLabel}>DRAWING YOUR SPREAD…</Text>
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </>
        ) : cardBasedModel ? (
          <>
            {cards.map((card) => (
              <TarotCard
                key={card.category}
                category={card.category}
                prediction={card.prediction}
                hero={card.hero}
                position={card.position}
                isFree={card.isFree}
                isRevealed={card.revealed}
                isPaidEntitled={isPaidEntitled}
                deeperEnabled={deeperEnabled}
                todayUnlockEnabled={todayUnlockEnabled}
                thirtyDayUnlockEnabled={thirtyDayUnlockEnabled}
                dailyPrice={dailyPrice}
                fullPrice={fullPrice}
                onUnlockPress={() => openPaywall(card.category, 'locked_card')}
                onBuyDailyPress={handleBuyDaily}
                onBuyFullPress={handleBuyFull}
              />
            ))}

            {showShuffle && (
              <>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleShuffle}
                  disabled={shuffleDisabled || purchasing}
                  style={[styles.shuffleBtn, shuffleDisabled && styles.shuffleBtnDisabled]}
                >
                  <Text style={[styles.shuffleBtnText, shuffleDisabled && styles.shuffleBtnTextDisabled]}>
                    {shuffleLabel}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.shuffleHint}>
                  {canShuffleUnlimited
                    ? 'Draw a brand-new spread as often as you like.'
                    : 'Each shuffle deals a fresh spread and opens all four cards.'}
                </Text>
              </>
            )}
          </>
        ) : (
          // Kill-switch fallback: the legacy signal list (no per-card ads).
          cards.map((card) => (
            <SignalCard
              key={card.category}
              category={card.category}
              prediction={card.prediction}
              isFree={card.isFree}
              isUnlocked={isPaidEntitled}
              isRevealed={card.revealed}
              isDeepUnlocked={card.revealed}
              isPaidEntitled={isPaidEntitled}
              deeperEnabled={deeperEnabled}
              rewardedAdsEnabled={false}
              todayUnlockEnabled={todayUnlockEnabled}
              thirtyDayUnlockEnabled={thirtyDayUnlockEnabled}
              dailyPrice={dailyPrice}
              fullPrice={fullPrice}
              onUnlockPress={() => openPaywall(card.category, 'locked_signal_header')}
              onBuyDailyPress={handleBuyDaily}
              onBuyFullPress={handleBuyFull}
            />
          ))
        )}

        {!isPaidEntitled && !loading && lockedCount > 0 && (
          <View style={styles.footerBlock}>
            <Text style={styles.footerTitle}>The rest of your spread is waiting.</Text>
            <Text style={styles.footerNote}>
              {[todayUnlockEnabled ? `Unlock today ${dailyPrice}` : null,
                thirtyDayUnlockEnabled ? `Open 30 days ${fullPrice}` : null]
                .filter(Boolean).join('  ·  ')}
            </Text>
          </View>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>

      <PaywallSheet
        visible={paywall !== null}
        onDismiss={() => setPaywall(null)}
        entryCategory={paywall?.category}
        entryPoint={paywall?.entryPoint}
        onRewardPress={
          canShuffleRewarded
            ? () => { setPaywall(null); handleShuffle(); }
            : null
        }
        rewardLabel="Or shuffle the deck with an ad"
        heading={"One card found you.\nThe rest are still face-down."}
        subheading="Turn the whole spread and the meanings beneath each card — or shuffle for a fresh draw."
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
  spreadIntro: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  spreadKicker: {
    ...type.kicker,
    color: palette.accent,
    letterSpacing: 2.5,
    marginBottom: spacing.xs,
  },
  spreadSub: {
    ...type.body,
    color: palette.textSub,
  },
  loadingLabel: {
    ...type.kicker,
    color: palette.accent,
    marginBottom: spacing.md,
    textAlign: 'center',
    letterSpacing: 3,
  },
  shuffleBtn: {
    marginTop: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.45)',
    backgroundColor: 'rgba(201,169,110,0.08)',
    alignItems: 'center',
  },
  shuffleBtnDisabled: {
    borderColor: palette.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  shuffleBtnText: {
    ...type.bodyMed,
    color: palette.accent,
    fontWeight: '700',
  },
  shuffleBtnTextDisabled: {
    color: palette.textMuted,
  },
  shuffleHint: {
    ...type.caption,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
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
