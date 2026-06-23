import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Animated,
  Easing,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { router, useFocusEffect } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { DayHeader } from '@/components/DayHeader';
import { TarotCard } from '@/components/TarotCard';
import { CardModal } from '@/components/CardModal';
import { SignalCard } from '@/components/SignalCard';
import { PaywallSheet } from '@/components/PaywallSheet';
import { SkeletonCard } from '@/components/SkeletonCard';
import { StarsBackground } from '@/components/StarsBackground';
import { Embers } from '@/components/Embers';
import { SafeBannerAd } from '@/components/SafeBannerAd';
import { TodaysSky } from '@/components/TodaysSky';
import { usePredictions } from '@/hooks/usePredictions';
import { useBilling } from '@/hooks/useBilling';
import { PRODUCT_DAILY, PRODUCT_FULL } from '@/services/billingService';
import { grantRevealAllToday } from '@/services/storageService';
import { showHeroShuffleRewardedAd, preloadHeroShuffleRewardedAd } from '@/services/heroShuffleRewardedAd';
import {
  getCategoryOrder,
  getDailyVibe,
  getDailyMoment,
  getDailyWatchFor,
} from '@/utils/freeCategory';
import { palette, spacing, type, radius } from '@/utils/theme';
import { track, Events } from '@/services/analyticsService';
import { tap, unlock as unlockHaptic } from '@/utils/haptics';

const SCREEN_W = Dimensions.get('window').width;

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
    backupHero,
    monetizationConfig,
    revealState,
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
  const [openCard, setOpenCard] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const adInFlightRef = useRef(false);
  const lastFocusRefreshAt = useRef(0);
  const hasFocusedOnce = useRef(false);
  // Drives scroll-parallax depth: stars + Today's-Sky backdrop drift behind the
  // content as you scroll. Native-driver only.
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = useRef(
    Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })
  ).current;

  // Cinematic mount: the sky + intro breathe in before the cards deal.
  const introAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (loading) return;
    introAnim.setValue(0);
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 720,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [loading, introAnim]);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => null);
  }, [loading]);

  const dailyPrice = getPrice(PRODUCT_DAILY);
  const fullPrice = getPrice(PRODUCT_FULL);

  const cardBasedModel = monetizationConfig.cardBasedModel !== false;
  const bannerEnabled = monetizationConfig.bannerAdEnabled !== false;
  const deeperEnabled = monetizationConfig.deeperMeaningEnabled !== false;
  const todayUnlockEnabled = monetizationConfig.todayUnlockEnabled !== false;
  const thirtyDayUnlockEnabled = monetizationConfig.thirtyDayUnlockEnabled !== false;
  const rewardedAdsEnabled = monetizationConfig.rewardedAdsEnabled !== false;

  const isPaidEntitled = unlocked || entitlement?.active;
  const isThirtyDay = !!entitlement?.thirtyDay;

  // Reveal model (WWHT 2.1):
  //   Free card is always face-up. The other three reveal together via ONE
  //   rewarded ad OR ₹29 (today) OR ₹49 (30 days). Revealing NEVER re-draws —
  //   today's deterministic spread is preserved; only visibility changes.
  const revealedAll = !!revealState?.revealedAll;
  const fullReveal = isPaidEntitled || inFreeWindow || revealedAll;

  const adRevealCount = revealState?.adRevealCount || 0;
  const maxAdReveals = monetizationConfig.maxRewardedShufflesPerDay ?? 3;
  const canRevealRewarded = !isPaidEntitled && !inFreeWindow && !revealedAll
    && rewardedAdsEnabled && adRevealCount < maxAdReveals;

  const revealMap = revealState?.revealedSignals || {};
  const categoryOrder = useMemo(() => getCategoryOrder(freeCategory), [freeCategory]);

  const heroImages = useMemo(() => {
    const poolImages = Array.isArray(heroPool?.images) ? heroPool.images : [];
    const source = poolImages.length ? poolImages : (getHeroUrl(heroImage) ? [heroImage] : []);
    return source.map(normalizeHero).filter(Boolean);
  }, [heroPool, heroImage]);

  // The Today's-Sky backdrop = the ops "backup image" (image or mp4).
  const backdrop = useMemo(() => normalizeHero(backupHero) || null, [backupHero]);

  const cards = useMemo(() => categoryOrder.map((cat, i) => {
    const isFreeCard = cat === freeCategory;
    const revealed = fullReveal || isFreeCard || !!revealMap[cat];
    const len = heroImages.length;
    const hero = len ? heroImages[i % len] : null;
    const prediction = predictions?.[cat];
    return { category: cat, prediction, hero, isFree: isFreeCard, revealed, position: i };
  }), [categoryOrder, freeCategory, fullReveal, revealMap, heroImages, predictions]);

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

  // Preload the rewarded reveal ad while a free user can still use it.
  useFocusEffect(
    useCallback(() => {
      if (!canRevealRewarded) return;
      preloadHeroShuffleRewardedAd({ forceFresh: false }).catch(() => null);
    }, [canRevealRewarded])
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

  // Watch one rewarded ad → reveal ALL of today's cards (no re-draw).
  const handleReveal = useCallback(async () => {
    if (adInFlightRef.current || revealing) return;
    tap();
    if (isPaidEntitled || inFreeWindow || revealedAll) return;
    if (!canRevealRewarded) {
      openPaywall(null, 'reveal_cap');
      return;
    }
    adInFlightRef.current = true;
    setRevealing(true);
    try {
      track(Events.HERO_SHUFFLE_AD_STARTED, { placement: 'card_reveal', user_day_number: dayNumber });
      const result = await showHeroShuffleRewardedAd({ metadata: { placement: 'card_reveal' } });
      if (!result.rewarded) {
        track(Events.HERO_SHUFFLE_AD_FAILED, { reason: result.reason || 'not_rewarded' });
        preloadHeroShuffleRewardedAd({ forceFresh: true }).catch(() => null);
        Alert.alert("The cards didn't turn", "The ad wasn't ready. Try again in a moment.");
        return;
      }
      await grantRevealAllToday('ad');
      await refreshRevealState();
      unlockHaptic();
      track(Events.HERO_SHUFFLE_AD_COMPLETED, { placement: 'card_reveal', user_day_number: dayNumber });
    } catch (err) {
      Alert.alert('Something went wrong', "The cards didn't turn. Try again in a moment.");
    } finally {
      adInFlightRef.current = false;
      setRevealing(false);
    }
  }, [revealing, isPaidEntitled, inFreeWindow, revealedAll, canRevealRewarded, dayNumber, openPaywall, refreshRevealState]);

  const vibe = getDailyVibe();
  const moment = getDailyMoment();
  const watchFor = getDailyWatchFor();

  // Banner is the ONE ad we keep — it shows for everyone (free, ₹29, ₹49).
  // ₹49 only removes the need to watch the rewarded ad.
  const hideBannerAd = paywall !== null || !bannerEnabled;

  const spreadSubtitle = isThirtyDay
    ? 'All four cards are face-up — ad-free for 30 days.'
    : isPaidEntitled
      ? 'All four cards are face-up for you today.'
      : inFreeWindow
        ? 'Your first days are open — every card is face-up.'
        : revealedAll
          ? 'You turned the full spread. All four are face-up.'
          : lockedCount > 0
            ? `One card is face-up. ${lockedCount} wait face-down.`
            : 'Your spread is open today.';

  const showReveal = !isPaidEntitled && !inFreeWindow && !revealedAll && lockedCount > 0;
  const revealLabel = revealing
    ? 'Turning the cards…'
    : '✦  Reveal the full spread — watch an ad';

  // Keep the reveal CTA alive: a breathing pulse + a gilt light that sweeps across.
  const revealPulse = useRef(new Animated.Value(0)).current;
  const revealSweep = useRef(new Animated.Value(0)).current;
  const liveReveal = showReveal && canRevealRewarded && !revealing && !purchasing;
  useEffect(() => {
    if (!liveReveal) return undefined;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(revealPulse, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(revealPulse, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const sweep = Animated.loop(
      Animated.sequence([
        Animated.timing(revealSweep, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(1500),
        Animated.timing(revealSweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    pulse.start();
    sweep.start();
    return () => { pulse.stop(); sweep.stop(); };
  }, [liveReveal, revealPulse, revealSweep]);

  return (
    <ScreenShell>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <StarsBackground scrollY={scrollY} />
      <Embers count={14} />

      <LinearGradient
        colors={['rgba(212,175,110,0.10)', 'rgba(8,7,12,0)']}
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

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={palette.textMuted}
            colors={[palette.textMuted]}
          />
        }
      >
        <Animated.View
          style={{
            opacity: introAnim,
            transform: [{ translateY: introAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          }}
        >
          <DayHeader unlocked={isPaidEntitled} streak={streak} />

          <View style={styles.spreadIntro}>
            <Text style={styles.spreadKicker}>YOUR FOUR-CARD SPREAD</Text>
            <Text style={styles.spreadSub}>{spreadSubtitle}</Text>
          </View>

          <TodaysSky vibe={vibe} moment={moment} watchFor={watchFor} backdrop={backdrop} scrollParallax={scrollY} />
        </Animated.View>

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
                canRevealWithAd={!card.revealed && canRevealRewarded}
                todayUnlockEnabled={todayUnlockEnabled}
                thirtyDayUnlockEnabled={thirtyDayUnlockEnabled}
                dailyPrice={dailyPrice}
                fullPrice={fullPrice}
                onOpen={() => setOpenCard(card)}
                onRevealWithAd={handleReveal}
                onUnlockPress={() => openPaywall(card.category, 'locked_card')}
                onBuyDailyPress={handleBuyDaily}
                onBuyFullPress={handleBuyFull}
              />
            ))}

            {showReveal && (
              <>
                <Animated.View
                  style={{ transform: [{ scale: revealPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }] }}
                >
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={canRevealRewarded ? handleReveal : () => openPaywall(null, 'reveal_cap')}
                    disabled={revealing || purchasing}
                    style={[styles.revealBtn, revealing && styles.revealBtnDisabled]}
                  >
                    <LinearGradient
                      colors={['rgba(212,175,110,0.22)', 'rgba(212,175,110,0.07)']}
                      style={styles.revealGradient}
                    >
                      <Text style={styles.revealBtnText}>
                        {canRevealRewarded ? revealLabel : 'Unlock the rest below'}
                      </Text>
                    </LinearGradient>
                    {liveReveal ? (
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.revealSweep,
                          {
                            opacity: revealSweep.interpolate({ inputRange: [0, 0.15, 0.5, 0.85, 1], outputRange: [0, 0.7, 1, 0.7, 0] }),
                            transform: [
                              { translateX: revealSweep.interpolate({ inputRange: [0, 1], outputRange: [-SCREEN_W, SCREEN_W] }) },
                              { rotate: '16deg' },
                            ],
                          },
                        ]}
                      >
                        <LinearGradient
                          colors={['transparent', 'rgba(245,232,196,0.5)', 'transparent']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={StyleSheet.absoluteFill}
                        />
                      </Animated.View>
                    ) : null}
                  </TouchableOpacity>
                </Animated.View>
                <Text style={styles.revealHint}>
                  {canRevealRewarded
                    ? `One ad turns all ${lockedCount} hidden cards — or unlock without ads below.`
                    : `Unlock today ${dailyPrice} · or 30 days ${fullPrice}`}
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
      </Animated.ScrollView>

      <CardModal
        visible={!!openCard}
        card={openCard}
        deeperEnabled={deeperEnabled}
        onClose={() => setOpenCard(null)}
      />

      <PaywallSheet
        visible={paywall !== null}
        onDismiss={() => setPaywall(null)}
        entryCategory={paywall?.category}
        entryPoint={paywall?.entryPoint}
        onRewardPress={
          canRevealRewarded
            ? () => { setPaywall(null); handleReveal(); }
            : null
        }
        rewardLabel="✦ Or reveal the whole spread with an ad"
        heading={"One card found you.\nThe rest are still face-down."}
        subheading="Turn the whole spread and the meaning beneath each card — watch one ad, or unlock without ads."
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
    height: 260,
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
    color: palette.accentBright,
    letterSpacing: 3,
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
  revealBtn: {
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.gilt,
    overflow: 'hidden',
  },
  revealBtnDisabled: {
    opacity: 0.6,
  },
  revealSweep: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    left: 0,
    width: 92,
  },
  revealGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  revealBtnText: {
    ...type.bodyMed,
    color: palette.accentBright,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  revealHint: {
    ...type.caption,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  footerBlock: {
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,110,0.20)',
    backgroundColor: 'rgba(212,175,110,0.05)',
  },
  footerTitle: {
    ...type.bodyMed,
    color: palette.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  footerNote: {
    ...type.caption,
    color: palette.accentBright,
    textAlign: 'center',
  },
  bottomSpace: { height: spacing.xxl },
});
