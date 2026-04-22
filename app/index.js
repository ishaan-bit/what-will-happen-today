/**
 * Home Screen — daily reading of 4 tarot-style signal cards.
 *
 * Behaviour:
 *   - First-ever open: ALL 4 cards readable + a one-time intro banner.
 *     User taps "Begin daily readings" → flips into the standard daily flow.
 *   - Daily flow (returning, not unlocked): 1 free card + 3 locked teasers.
 *   - Unlocked (₹29 today / ₹49 forever): all 4 readable.
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
import { ScreenShell } from '@/components/ScreenShell';
import { DayHeader } from '@/components/DayHeader';
import { SignalCard } from '@/components/SignalCard';
import { PaywallSheet } from '@/components/PaywallSheet';
import { SkeletonCard } from '@/components/SkeletonCard';
import { StarsBackground } from '@/components/StarsBackground';
import { usePredictions } from '@/hooks/usePredictions';
import {
  getCategoryOrder,
  getDailyVibe,
  getDailyMoment,
  getDailyWatchFor,
} from '@/utils/freeCategory';
import { palette, spacing, type, radius } from '@/utils/theme';
import { VibeBar } from '@/components/VibeBar';
import { track, Events } from '@/services/analyticsService';
import { tap, unlock as unlockHaptic } from '@/utils/haptics';

export default function HomeScreen() {
  const {
    predictions,
    unlocked,
    loading,
    refreshUnlock,
    freeCategory,
    isFirstEver,
    dismissFirstEver,
    streak,
  } = usePredictions();
  const [paywallCategory, setPaywallCategory] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Hide splash once initial load completes
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => null);
  }, [loading]);

  // Auto-close paywall when unlock state flips true
  const prevUnlocked = useRef(unlocked);
  useEffect(() => {
    if (!prevUnlocked.current && unlocked && paywallCategory !== null) {
      setPaywallCategory(null);
    }
    prevUnlocked.current = unlocked;
  }, [unlocked, paywallCategory]);

  // Track free card impression
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

  const handleBeginDaily = useCallback(() => {
    unlockHaptic();
    track(Events.FIRST_TIME_PREVIEW_DISMISS);
    dismissFirstEver();
  }, [dismissFirstEver]);

  const categoryOrder = getCategoryOrder(freeCategory);
  const vibe = getDailyVibe();
  const moment = getDailyMoment();
  const watchFor = getDailyWatchFor();

  // Effective unlock state: first-time users see all cards too
  const showAll = unlocked || isFirstEver;

  return (
    <ScreenShell>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      {/* Star field — subtle backdrop */}
      <StarsBackground />

      {/* Atmospheric top glow */}
      <LinearGradient
        colors={['rgba(201,169,110,0.07)', 'rgba(7,8,15,0)']}
        style={styles.topGlow}
        pointerEvents="none"
      />

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
        <VibeBar vibe={vibe} moment={moment} watchFor={watchFor} />

        {loading && !predictions ? (
          <>
            <Text style={styles.loadingLabel}>DRAWING YOUR CARDS…</Text>
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </>
        ) : isFirstEver ? (
          // ────── FIRST-TIME USER: full reveal of all 4 cards ──────
          <>
            <View style={styles.firstTimeBanner}>
              <Text style={styles.firstTimeKicker}>✦ YOUR FIRST READING ✦</Text>
              <Text style={styles.firstTimeTitle}>All four cards drawn for you.</Text>
              <Text style={styles.firstTimeBody}>
                Today only, every signal is open. Tomorrow one stays free —
                the rest become a reading you choose to unlock.
              </Text>
            </View>

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

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleBeginDaily}
              style={styles.beginDailyBtn}
            >
              <LinearGradient
                colors={['rgba(201,169,110,0.22)', 'rgba(201,169,110,0.10)']}
                style={styles.beginDailyGradient}
              >
                <Text style={styles.beginDailyText}>Begin daily readings →</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.firstTimeFooter}>
              From tomorrow: ₹29 unlocks today · ₹49 unlocks the month
            </Text>
          </>
        ) : (
          // ────── DAILY FLOW (returning users) ──────
          <>
            <Text style={styles.sectionLabel}>YOUR CARD FOR TODAY</Text>
            <SignalCard
              category={categoryOrder[0]}
              prediction={predictions?.[categoryOrder[0]]}
              isFree={!unlocked}
              isUnlocked={unlocked}
              onUnlockPress={() => handleUnlockPress(categoryOrder[0])}
            />

            {!unlocked && (
              <Text style={styles.sectionLabelDim}>THE REST OF THE READING</Text>
            )}
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

            {!unlocked && (
              <View style={styles.footerBlock}>
                <Text style={styles.footerNote}>
                  One free card every day · ₹29 reveals today, ₹49 the whole month
                </Text>
              </View>
            )}
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
  scroll: {
    flex: 1,
    zIndex: 1,
  },
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
    marginTop: spacing.xs,
    letterSpacing: 2.5,
  },
  sectionLabelDim: {
    ...type.kicker,
    color: palette.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
    letterSpacing: 2.5,
  },
  footerBlock: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  footerNote: {
    ...type.caption,
    color: palette.textDim,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  bottomSpace: {
    height: spacing.xxl,
  },
  // ── First-time user banner ─────────────────────────────────
  firstTimeBanner: {
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.28)',
    backgroundColor: 'rgba(201,169,110,0.05)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  firstTimeKicker: {
    ...type.kicker,
    color: palette.accent,
    letterSpacing: 3,
    marginBottom: spacing.xs,
  },
  firstTimeTitle: {
    ...type.heading,
    color: palette.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  firstTimeBody: {
    ...type.caption,
    color: palette.textSub,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: spacing.xs,
  },
  beginDailyBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.45)',
    overflow: 'hidden',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  beginDailyGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  beginDailyText: {
    ...type.bodyMed,
    color: palette.accent,
    letterSpacing: 0.5,
  },
  firstTimeFooter: {
    ...type.caption,
    color: palette.textDim,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
