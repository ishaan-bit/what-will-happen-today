/**
 * Home Screen — daily reading of 4 tarot-style signal cards.
 *
 * Lifecycle:
 *   - Days 1-3 (free window): all 4 cards open + "Day X of 3" badge.
 *   - Day 4 (one-time):       transition banner explains the shift.
 *   - Day 4+ (daily flow):    1 free signal + 3 locked teasers (₹29 / ₹49).
 *   - Unlocked:               all 4 readable.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { router } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { DayHeader } from '@/components/DayHeader';
import { SignalCard } from '@/components/SignalCard';
import { PaywallSheet } from '@/components/PaywallSheet';
import { SkeletonCard } from '@/components/SkeletonCard';
import { StarsBackground } from '@/components/StarsBackground';
import { HeroImage } from '@/components/HeroImage';
import { usePredictions } from '@/hooks/usePredictions';
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

export default function HomeScreen() {
  const {
    predictions,
    heroImage,
    unlocked,
    loading,
    refreshUnlock,
    freeCategory,
    streak,
    dayNumber,
    inFreeWindow,
    freeWindowSize,
    showDay4,
    dismissDay4,
  } = usePredictions();
  const [paywallCategory, setPaywallCategory] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => null);
  }, [loading]);

  const prevUnlocked = useRef(unlocked);
  useEffect(() => {
    if (!prevUnlocked.current && unlocked && paywallCategory !== null) {
      setPaywallCategory(null);
    }
    prevUnlocked.current = unlocked;
  }, [unlocked, paywallCategory]);

  useEffect(() => {
    if (predictions && freeCategory) {
      track(Events.FREE_CARD_IMPRESSION, { category: freeCategory });
    }
  }, [predictions, freeCategory]);

  const handleUnlockPress = useCallback((category) => {
    setPaywallCategory(category);
    track(Events.PAYWALL_VIEW, { category, entry_point: 'home_locked_card' });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshUnlock();
    setRefreshing(false);
  }, [refreshUnlock]);

  const handleDismissDay4 = useCallback(() => {
    unlockHaptic();
    track(Events.FIRST_TIME_PREVIEW_DISMISS, { context: 'day4_transition' });
    dismissDay4();
  }, [dismissDay4]);

  const handleSettings = useCallback(() => {
    tap();
    router.push('/settings');
  }, []);

  const categoryOrder = getCategoryOrder(freeCategory);
  const vibe = getDailyVibe();
  const moment = getDailyMoment();
  const watchFor = getDailyWatchFor();

  // Effective open state: unlocked OR still inside the 3-day free window
  const showAll = unlocked || inFreeWindow;

  return (
    <ScreenShell>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <StarsBackground />

      <LinearGradient
        colors={['rgba(201,169,110,0.07)', 'rgba(7,8,15,0)']}
        style={styles.topGlow}
        pointerEvents="none"
      />

      {/* Settings gear (top right) */}
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
        <DayHeader unlocked={unlocked} streak={streak} />

        {/* Optional hero image, only renders when ops console publishes one */}
        <HeroImage source={heroImage?.url} alt={heroImage?.alt} />

        {/* Free-window day badge, Day 1/2/3 of 3 */}
        {!unlocked && inFreeWindow && (
          <View style={styles.freeBadge}>
            <Text style={styles.freeBadgeText}>
              {dayNumber === freeWindowSize
                ? 'FINAL FREE DAY · ALL SIGNALS UNLOCKED'
                : `DAY ${dayNumber} OF ${freeWindowSize} · ALL SIGNALS UNLOCKED`}
            </Text>
          </View>
        )}

        {/* Day-4 transition banner — one-time */}
        {showDay4 && !unlocked && (
          <View style={styles.day4Banner}>
            <Text style={styles.day4Kicker}>✦ THE FREE WINDOW IS DONE ✦</Text>
            <Text style={styles.day4Title}>Your first 3 days are complete.</Text>
            <Text style={styles.day4Body}>
              From today, one signal stays free.{'\n'}
              The rest wait to be revealed.
            </Text>
            <TouchableOpacity activeOpacity={0.85} onPress={handleDismissDay4} style={styles.day4Btn}>
              <LinearGradient
                colors={['rgba(201,169,110,0.22)', 'rgba(201,169,110,0.10)']}
                style={styles.day4BtnGradient}
              >
                <Text style={styles.day4BtnText}>See today's reading →</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        <TodaysSky vibe={vibe} moment={moment} watchFor={watchFor} />

        {loading && !predictions ? (
          <>
            <Text style={styles.loadingLabel}>DRAWING YOUR CARDS…</Text>
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </>
        ) : showAll ? (
          // ────── Full reveal: free window OR unlocked ──────
          <>
            <Text style={styles.sectionLabel}>
              {inFreeWindow ? "TODAY'S FOUR SIGNALS" : 'ALL FOUR SIGNALS UNLOCKED'}
            </Text>
            {categoryOrder.map((cat) => (
              <SignalCard
                key={cat}
                category={cat}
                prediction={predictions?.[cat]}
                isFree={true}
                isUnlocked={true}
                onUnlockPress={() => handleUnlockPress(cat)}
              />
            ))}
            {inFreeWindow && (
              <Text style={styles.freeWindowFooter}>
                After day {freeWindowSize}: ₹29 reveals today · ₹49 reveals 30 days
              </Text>
            )}
          </>
        ) : (
          // ────── Daily flow (returning users, day 4+) ──────
          <>
            <Text style={styles.sectionLabel}>TODAY'S REVEALED SIGNAL</Text>
            <Text style={styles.sectionSub}>This one found you first.</Text>
            <SignalCard
              category={categoryOrder[0]}
              prediction={predictions?.[categoryOrder[0]]}
              isFree={!unlocked}
              isUnlocked={unlocked}
              onUnlockPress={() => handleUnlockPress(categoryOrder[0])}
            />

            <Text style={styles.sectionLabelDim}>THREE MORE WAITING TO UNFOLD</Text>
            {[1, 2, 3].map((i) => (
              <SignalCard
                key={categoryOrder[i]}
                category={categoryOrder[i]}
                prediction={predictions?.[categoryOrder[i]]}
                isFree={false}
                isUnlocked={unlocked}
                onUnlockPress={() => handleUnlockPress(categoryOrder[i])}
              />
            ))}

            <View style={styles.footerBlock}>
              <Text style={styles.footerNote}>
                One signal revealed daily · ₹29 reveals today · ₹49 reveals 30 days
              </Text>
            </View>
          </>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>

      <PaywallSheet
        visible={paywallCategory !== null}
        onDismiss={() => setPaywallCategory(null)}
        entryCategory={paywallCategory}
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
  sectionLabelDim: {
    ...type.kicker,
    color: palette.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
    letterSpacing: 2.5,
  },
  footerBlock: { alignItems: 'center', marginTop: spacing.md },
  footerNote: {
    ...type.caption,
    color: palette.textDim,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  bottomSpace: { height: spacing.xxl },
  freeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.45)',
    backgroundColor: 'rgba(201,169,110,0.10)',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  freeBadgeText: {
    ...type.kicker,
    color: palette.accent,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  freeWindowFooter: {
    ...type.caption,
    color: palette.textDim,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  day4Banner: {
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.40)',
    backgroundColor: 'rgba(201,169,110,0.06)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  day4Kicker: {
    ...type.kicker,
    color: palette.accent,
    letterSpacing: 3,
    marginBottom: spacing.xs,
  },
  day4Title: {
    ...type.heading,
    color: palette.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  day4Body: {
    ...type.caption,
    color: palette.textSub,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
  day4Btn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.45)',
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  day4BtnGradient: {
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  day4BtnText: {
    ...type.bodyMed,
    color: palette.accent,
    letterSpacing: 0.5,
  },
});
