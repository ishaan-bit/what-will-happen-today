/**
 * UnlockModal
 *
 * Slides up from bottom. Shows both purchase options.
 * Semi-transparent overlay dims the home screen behind it.
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useBilling } from '@/hooks/useBilling';
import { usePredictions } from '@/hooks/usePredictions';
import { palette, spacing, radius, type } from '@/utils/theme';
import { tap } from '@/utils/haptics';
import { track, Events } from '@/services/analyticsService';

export function UnlockModal({ visible, onDismiss }) {
  const { getPrice, buyDaily, buyFull, restore, purchasing, restoring } = useBilling();
  const { refreshUnlock } = usePredictions();
  const [lastError, setLastError] = useState(null);

  const handleDailyPress = useCallback(async () => {
    tap();
    setLastError(null);
    try {
      await buyDaily();
      // Purchase success is handled via purchaseUpdatedListener in BillingProvider.
      // BillingBridge calls refreshUnlock() which triggers usePredictions re-render,
      // causing HomeScreen to close the modal via useEffect.
    } catch (err) {
      if (err.message !== 'Purchase cancelled') {
        setLastError(err.message);
      }
    }
  }, [buyDaily]);

  const handleFullPress = useCallback(async () => {
    tap();
    setLastError(null);
    try {
      await buyFull();
      // Same async listener pattern as daily.
    } catch (err) {
      if (err.message !== 'Purchase cancelled') {
        setLastError(err.message);
      }
    }
  }, [buyFull]);

  const handleRestore = useCallback(async () => {
    tap();
    const restored = await restore();
    if (restored) {
      await refreshUnlock();
      onDismiss?.();
    } else {
      Alert.alert('Nothing to restore', 'No previous purchases found.');
    }
  }, [restore, refreshUnlock, onDismiss]);

  const handleDismiss = useCallback(() => {
    track(Events.PAYWALL_DISMISS);
    onDismiss?.();
  }, [onDismiss]);

  const dailyPrice = getPrice('daily_unlock_v1');
  const fullPrice = getPrice('full_unlock_v1');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <Text style={styles.headline}>Unlock today's insights</Text>
        <Text style={styles.subline}>
          Full predictions, personalized actions, and deeper patterns.
        </Text>

        {/* Primary: Full day unlock */}
        <TouchableOpacity
          style={styles.primaryOption}
          onPress={handleDailyPress}
          activeOpacity={0.85}
          disabled={purchasing || restoring}
        >
          <LinearGradient
            colors={['rgba(201,169,110,0.18)', 'rgba(201,169,110,0.06)']}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={styles.optionLeft}>
            <Text style={styles.optionTitle}>Today's full reading</Text>
            <Text style={styles.optionDesc}>All 4 categories, unlocked until midnight</Text>
          </View>
          <View style={styles.priceTag}>
            {purchasing ? (
              <ActivityIndicator color={palette.accent} size="small" />
            ) : (
              <Text style={styles.price}>{dailyPrice}</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Secondary: Full unlock */}
        <TouchableOpacity
          style={styles.secondaryOption}
          onPress={handleFullPress}
          activeOpacity={0.85}
          disabled={purchasing || restoring}
        >
          <View style={styles.optionLeft}>
            <View style={styles.bestValueRow}>
              <Text style={styles.optionTitleDark}>Unlock everything</Text>
              <View style={styles.bestBadge}>
                <Text style={styles.bestBadgeText}>BEST VALUE</Text>
              </View>
            </View>
            <Text style={styles.optionDescDark}>Every day, every category, forever</Text>
          </View>
          <View style={styles.priceTag}>
            {purchasing ? (
              <ActivityIndicator color={palette.text} size="small" />
            ) : (
              <Text style={styles.priceDark}>{fullPrice}</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Error display */}
        {lastError ? (
          <Text style={styles.errorText}>{lastError}</Text>
        ) : null}

        {/* Restore + legal */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={handleRestore} disabled={restoring}>
            <Text style={styles.restoreText}>
              {restoring ? 'Restoring…' : 'Restore purchase'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.legalText}>
            One-time payment · No subscription · No account required
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: palette.elevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: palette.glassBorder,
  },
  handle: {
    width: 38,
    height: 4,
    backgroundColor: palette.glassBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  headline: {
    ...type.title,
    color: palette.text,
    marginBottom: spacing.xs,
  },
  subline: {
    ...type.body,
    color: palette.textSub,
    marginBottom: spacing.lg,
  },

  // Primary option (daily)
  primaryOption: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.accent,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },

  // Secondary option (full)
  secondaryOption: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    backgroundColor: palette.surface,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },

  optionLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  optionTitle: {
    ...type.bodyMed,
    color: palette.accent,
    marginBottom: 2,
  },
  optionDesc: {
    ...type.caption,
    color: palette.textSub,
  },
  optionTitleDark: {
    ...type.bodyMed,
    color: palette.text,
    marginBottom: 2,
  },
  optionDescDark: {
    ...type.caption,
    color: palette.textSub,
  },
  bestValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  bestBadge: {
    backgroundColor: 'rgba(110,212,176,0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bestBadgeText: {
    ...type.kicker,
    color: palette.money,
    fontSize: 8,
  },

  priceTag: {
    alignItems: 'flex-end',
    minWidth: 40,
  },
  price: {
    ...type.heading,
    color: palette.accent,
  },
  priceDark: {
    ...type.heading,
    color: palette.text,
  },

  errorText: {
    ...type.caption,
    color: palette.danger,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  footer: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  restoreText: {
    ...type.caption,
    color: palette.textMuted,
    textDecorationLine: 'underline',
  },
  legalText: {
    ...type.caption,
    color: palette.textDim,
    textAlign: 'center',
    fontSize: 11,
  },
});
