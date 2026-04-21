/**
 * Home Screen – the entire app experience in one screen.
 *
 * Renders immediately with local predictions (no network dependency).
 * Four expandable category cards + paywall modal.
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
import { PredictionCard } from '@/components/PredictionCard';
import { UnlockModal } from '@/components/UnlockModal';
import { SkeletonCard } from '@/components/SkeletonCard';
import { usePredictions } from '@/hooks/usePredictions';
import { palette, spacing } from '@/utils/theme';

const CATEGORY_ORDER = ['love', 'career', 'money', 'mood'];

export default function HomeScreen() {
  const { predictions, unlocked, loading, refreshUnlock } = usePredictions();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Hide splash screen once initial prediction load completes
  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => null);
    }
  }, [loading]);

  // Auto-close paywall when unlock state transitions to true
  // (triggered by BillingBridge → refreshUnlock after purchase listener fires)
  const prevUnlocked = useRef(unlocked);
  useEffect(() => {
    if (!prevUnlocked.current && unlocked && paywallVisible) {
      setPaywallVisible(false);
    }
    prevUnlocked.current = unlocked;
  }, [unlocked, paywallVisible]);

  const handleUnlockPress = useCallback(() => {
    setPaywallVisible(true);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshUnlock();
    setRefreshing(false);
  }, [refreshUnlock]);

  return (
    <ScreenShell>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      {/* Atmospheric top glow */}
      <LinearGradient
        colors={[
          'rgba(201,169,110,0.06)',
          'rgba(7,8,15,0)',
        ]}
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
        <DayHeader />

        {/* Category teaser line below the header */}
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitleText}>Your patterns for today.</Text>
          {unlocked && (
            <Text style={styles.unlockedBadge}>✦ Unlocked</Text>
          )}
        </View>

        {/* Prediction cards */}
        {loading && !predictions
          ? CATEGORY_ORDER.map((cat) => <SkeletonCard key={cat} />)
          : CATEGORY_ORDER.map((cat) => (
              <PredictionCard
                key={cat}
                category={cat}
                prediction={predictions?.[cat]}
                unlocked={unlocked}
                onUnlockPress={handleUnlockPress}
              />
            ))}

        {/* Bottom breathing room */}
        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* Paywall */}
      <UnlockModal
        visible={paywallVisible}
        onDismiss={() => setPaywallVisible(false)}

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
    paddingBottom: spacing.xxl,
  },
  subtitleRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subtitleText: {
    fontSize: 13,
    color: palette.textMuted,
    letterSpacing: 0.3,
  },
  unlockedBadge: {
    fontSize: 11,
    color: palette.accent,
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  bottomSpace: {
    height: spacing.xxl,
  },
});
