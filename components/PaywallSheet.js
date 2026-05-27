/**
 * PaywallSheet
 *
 * Bottom sheet paywall. Full unlock is PRIMARY (best value).
 * Daily unlock is secondary. Category hint row when entryCategory supplied.
 */

import { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, spacing, radius, type, CATEGORY_META } from '@/utils/theme';
import { tap, unlock as unlockHaptic } from '@/utils/haptics';
import { useBilling } from '@/hooks/useBilling';
import { track, Events } from '@/services/analyticsService';

export function PaywallSheet({
  visible,
  onDismiss,
  entryCategory,
  entryPoint = 'home_locked_card',
  onRewardPress,
  rewardLabel = 'Or reveal one more with an ad',
  heading = 'The first signal found you.\nThe rest are still waiting.',
  subheading = 'Reveal the hidden signals and the deeper meanings under them.',
}) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(400)).current;
  const { purchasing, restoring, getPrice, buyDaily, buyFull, restore } = useBilling();

  // Slide sheet in/out when visibility changes
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(400);
    }
  }, [visible, slideAnim]);

  const handleDismiss = useCallback(() => {
    tap();
    track(Events.PAYWALL_DISMISS, { entry_category: entryCategory, paywall_entry_point: entryPoint });
    onDismiss?.();
  }, [onDismiss, entryCategory, entryPoint]);

  const handleBuyFull = useCallback(async () => {
    tap();
    track(Events.PAYWALL_OPTION_SELECT, {
      product_id: 'full_unlock_v1',
      entry_category: entryCategory,
      paywall_entry_point: entryPoint,
    });
    try {
      await buyFull();
      unlockHaptic();
      onDismiss?.();
    } catch (_) {
      // purchase cancelled or failed — handled by billing
    }
  }, [buyFull, onDismiss, entryCategory, entryPoint]);

  const handleBuyDaily = useCallback(async () => {
    tap();
    track(Events.PAYWALL_OPTION_SELECT, {
      product_id: 'daily_unlock_v1',
      entry_category: entryCategory,
      paywall_entry_point: entryPoint,
    });
    try {
      await buyDaily();
      unlockHaptic();
      onDismiss?.();
    } catch (_) {
      // purchase cancelled or failed
    }
  }, [buyDaily, onDismiss, entryCategory, entryPoint]);

  const handleRestore = useCallback(async () => {
    tap();
    track(Events.RESTORE_PURCHASE_TAP, { paywall_entry_point: entryPoint });
    try {
      const restored = await restore();
      if (restored) {
        unlockHaptic();
        onDismiss?.();
      }
    } catch (_) {}
  }, [restore, onDismiss, entryPoint]);

  const entryCategoryMeta = entryCategory ? CATEGORY_META[entryCategory] : null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      {/* Overlay tap-to-dismiss */}
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Category hint – when opened from a specific locked card */}
        {entryCategoryMeta ? (
          <View style={[styles.categoryHint, { backgroundColor: `${entryCategoryMeta.color}14` }]}>
            <Text style={[styles.categoryHintIcon, { color: entryCategoryMeta.color }]}>
              {entryCategoryMeta.icon}
            </Text>
            <Text style={[styles.categoryHintText, { color: entryCategoryMeta.color }]}>
              {entryCategoryMeta.label} signal · waiting for you
            </Text>
          </View>
        ) : null}

        {/* Heading */}
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.subheading}>{subheading}</Text>

        {/* Categories row */}
        <View style={styles.categoriesRow}>
          {Object.entries(CATEGORY_META).map(([key, meta]) => (
            <View key={key} style={styles.categoryItem}>
              <View style={[styles.categoryBubble, { backgroundColor: `${meta.color}1a` }]}>
                <Text style={[styles.categoryBubbleIcon, { color: meta.color }]}>{meta.icon}</Text>
              </View>
              <Text style={[styles.categoryBubbleLabel, { color: meta.color }]}>{meta.label}</Text>
            </View>
          ))}
        </View>

        {onRewardPress ? (
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={onRewardPress}
            disabled={purchasing || restoring}
            style={styles.rewardOption}
          >
            <Text style={styles.rewardOptionText}>{rewardLabel}</Text>
          </TouchableOpacity>
        ) : null}

        {/* PRIMARY: Full unlock */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleBuyFull}
          disabled={purchasing || restoring}
          style={styles.primaryOption}
        >
          <LinearGradient
            colors={['rgba(201,169,110,0.15)', 'rgba(201,169,110,0.06)']}
            style={styles.primaryGradient}
          >
            {/* BEST VALUE badge */}
            <View style={styles.bestValueBadge}>
              <Text style={styles.bestValueText}>BEST VALUE</Text>
            </View>

            <View style={styles.optionContent}>
              <View style={styles.optionLeft}>
                <Text style={styles.optionTitle}>30 days of full readings</Text>
                <Text style={styles.optionDesc}>Every event, every day · just ₹1.6/day</Text>
              </View>
              {purchasing ? (
                <ActivityIndicator size="small" color={palette.accent} />
              ) : (
                <Text style={styles.optionPrice}>{getPrice('full_unlock_v1')}</Text>
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* SECONDARY: Daily unlock */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleBuyDaily}
          disabled={purchasing || restoring}
          style={styles.secondaryOption}
        >
          <View style={styles.optionContent}>
            <View style={styles.optionLeft}>
              <Text style={styles.secondaryTitle}>See today's other 3 events</Text>
              <Text style={styles.optionDesc}>Reveals the rest of today's reading</Text>
            </View>
            {purchasing ? (
              <ActivityIndicator size="small" color={palette.textSub} />
            ) : (
              <Text style={styles.secondaryPrice}>{getPrice('daily_unlock_v1')}</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={handleRestore} disabled={restoring}>
            <Text style={styles.restoreText}>
              {restoring ? 'Restoring…' : 'Restore purchase'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.legalText}>
            One-time payment via Google Play · No auto-renewal · Cancel anytime{'\n'}Razor-sharp daily readings, drawn fresh at midnight
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: palette.overlay,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: palette.elevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: palette.glassBorder,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: palette.textDim,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  categoryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  categoryHintIcon: {
    fontSize: 14,
  },
  categoryHintText: {
    ...type.caption,
    fontWeight: '500',
  },
  heading: {
    ...type.title,
    color: palette.text,
    marginBottom: 4,
  },
  subheading: {
    ...type.body,
    color: palette.textSub,
    marginBottom: spacing.md,
  },
  categoriesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  categoryItem: {
    alignItems: 'center',
    gap: 5,
  },
  categoryBubble: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBubbleIcon: {
    fontSize: 18,
  },
  categoryBubbleLabel: {
    ...type.kicker,
    fontSize: 9,
  },
  primaryOption: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: `${palette.accent}55`,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  primaryGradient: {
    padding: spacing.md,
  },
  bestValueBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 3,
  },
  bestValueText: {
    ...type.kicker,
    fontSize: 9,
    color: '#1a1200',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.xl,
  },
  optionLeft: {
    flex: 1,
  },
  optionTitle: {
    ...type.bodyMed,
    color: palette.accent,
    marginBottom: 3,
  },
  optionDesc: {
    ...type.caption,
    color: palette.textSub,
  },
  optionPrice: {
    ...type.heading,
    color: palette.accent,
  },
  secondaryOption: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    backgroundColor: palette.surface,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  rewardOption: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.35)',
    backgroundColor: 'rgba(201,169,110,0.07)',
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  rewardOptionText: {
    ...type.bodyMed,
    color: palette.accent,
    textAlign: 'center',
  },
  secondaryTitle: {
    ...type.bodyMed,
    color: palette.text,
    marginBottom: 3,
  },
  secondaryPrice: {
    ...type.heading,
    color: palette.textSub,
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
    lineHeight: 17,
    fontSize: 11,
  },
});
