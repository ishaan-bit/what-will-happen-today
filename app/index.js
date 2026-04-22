/**
 * Home Screen – free category rotation + conversion-ready paywall flow.
 *
 * One category is free each day (rotates daily). The other three are locked
 * behind the paywall. Unlocked users see all four cards fully expanded.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { ScreenShell } from '@/components/ScreenShell';
import { DayHeader } from '@/components/DayHeader';
import { SignalCard } from '@/components/SignalCard';
import { PaywallSheet } from '@/components/PaywallSheet';
import { SkeletonCard } from '@/components/SkeletonCard';
import { usePredictions } from '@/hooks/usePredictions';
import { getCategoryOrder } from '@/utils/freeCategory';
import { palette, spacing, type } from '@/utils/theme';
import { track, Events } from '@/services/analyticsService';

export default function HomeScreen() {
  const { predictions, unlocked, loading, refreshUnlock, freeCategory } = usePredictions();
  const [paywallCategory, setPaywallCategory] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Hide splash screen once initial prediction load completes
  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => null);
    }
  }, [loading]);

  // Auto-close paywall when unlock state transitions to true
  const prevUnlocked = useRef(unlocked);
  useEffect(() => {
    if (!prevUnlocked.current && unlocked && paywallCategory !== null) {
      setPaywallCategory(null);
    }
    prevUnlocked.current = unlocked;
  }, [unlocked, paywallCategory]);

  // Track free card impression once predictions + freeCategory are ready
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

  const categoryOrder = getCategoryOrder(freeCategory);

  return (
    <ScreenShell>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      {/* Atmospheric top glow */}
      <LinearGradient
        colors={['rgba(201,169,110,0.06)', 'rgba(7,8,15,0)']}
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
        <DayHeader unlocked={unlocked} />

        {loading && !predictions ? (
          [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
        ) : (
          <>
            {/* --- FREE SIGNAL --- */}
            <Text style={styles.sectionLabel}>THIS SHOWED UP FOR YOU TODAY</Text>
            <SignalCard
              category={categoryOrder[0]}
              prediction={predictions?.[categoryOrder[0]]}
              isFree={!unlocked}
              isUnlocked={unlocked}
              onUnlockPress={() => handleUnlockPress(categoryOrder[0])}
            />

            {/* --- MORE FOR TODAY --- */}
            {!unlocked && (
              <Text style={styles.sectionLabelDim}>MORE FOR TODAY</Text>
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
              <Text style={styles.footerNote}>
                One free signal every day. Unlock the rest for ₹29.
              </Text>
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
  sectionLabel: {
    ...type.kicker,
    color: palette.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionLabelDim: {
    ...type.kicker,
    color: palette.textDim,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  footerNote: {
    ...type.caption,
    color: palette.textDim,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  bottomSpace: {
    height: spacing.xxl,
  },
});
