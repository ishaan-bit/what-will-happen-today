/**
 * PredictionCard
 *
 * Collapsed: shows category label + teaser. Tapping expands.
 * Expanded: shows teaser (clear) + full + action (blurred if locked).
 * Has an "Unlock" CTA that triggers the paywall when locked.
 */

import { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, spacing, radius, type, CATEGORY_META } from '@/utils/theme';
import { tap, expand } from '@/utils/haptics';
import { track, Events } from '@/services/analyticsService';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function PredictionCard({ category, prediction, unlocked, onUnlockPress }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[category] || CATEGORY_META.mood;

  const handleHeaderPress = useCallback(() => {
    tap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    if (next) {
      track(Events.CATEGORY_TAP, { category });
    }
  }, [expanded, category]);

  const handleUnlockPress = useCallback(() => {
    expand();
    track(Events.PAYWALL_VIEW, { category });
    onUnlockPress?.();
  }, [category, onUnlockPress]);

  if (!prediction) return null;

  return (
    <View style={[styles.card, expanded && styles.cardExpanded]}>
      {/* Header row */}
      <TouchableOpacity
        style={styles.header}
        onPress={handleHeaderPress}
        activeOpacity={0.75}
      >
        <View style={styles.labelRow}>
          <Text style={[styles.categoryIcon, { color: meta.color }]}>{meta.icon}</Text>
          <Text style={[styles.categoryLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '∧' : '∨'}</Text>
      </TouchableOpacity>

      {/* Teaser */}
      <Text style={styles.teaser}>{prediction.teaser}</Text>

      {/* Expanded content */}
      {expanded && (
        <>
          {/* Locked content: blurred overlay */}
          {!unlocked ? (
            <LockedContent onUnlockPress={handleUnlockPress} meta={meta} prediction={prediction} />
          ) : (
            <UnlockedContent prediction={prediction} />
          )}
        </>
      )}
    </View>
  );
}

/** Full content when unlocked */
function UnlockedContent({ prediction }) {
  return (
    <View style={styles.unlockedBlock}>
      <Text style={styles.fullText}>{prediction.full}</Text>
      <View style={styles.actionRow}>
        <Text style={styles.actionLabel}>TODAY</Text>
        <Text style={styles.actionText}>{prediction.action}</Text>
      </View>
    </View>
  );
}

/** Blurred / teased content with CTA when locked */
function LockedContent({ onUnlockPress, meta, prediction }) {
  return (
    <View style={styles.lockedBlock}>
      {/* Faded preview of full text */}
      <View style={styles.previewWrapper}>
        <Text style={styles.previewText} numberOfLines={3}>
          {prediction.full}
        </Text>
        <LinearGradient
          colors={[
            'rgba(7,8,15,0)',
            'rgba(7,8,15,0.6)',
            'rgba(7,8,15,0.88)',
            'rgba(7,8,15,0.97)',
          ]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      </View>

      {/* Blurred action preview */}
      <View style={styles.previewWrapper}>
        <Text style={styles.previewAction} numberOfLines={1}>
          {prediction.action}
        </Text>
        <LinearGradient
          colors={['rgba(7,8,15,0.3)', 'rgba(7,8,15,0.92)']}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={[styles.unlockBtn, { borderColor: meta.color }]}
        onPress={onUnlockPress}
        activeOpacity={0.8}
      >
        <Text style={[styles.unlockBtnText, { color: meta.color }]}>
          Unlock full insight
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  cardExpanded: {
    borderColor: 'rgba(255,255,255,0.10)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  categoryIcon: {
    fontSize: 14,
    lineHeight: 18,
  },
  categoryLabel: {
    ...type.kicker,
    color: palette.textSub,
  },
  chevron: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  teaser: {
    ...type.bodyMed,
    color: palette.text,
    lineHeight: 24,
  },

  // Unlocked
  unlockedBlock: {
    marginTop: spacing.md,
  },
  fullText: {
    ...type.body,
    color: palette.textSub,
    lineHeight: 23,
    marginBottom: spacing.md,
  },
  actionRow: {
    backgroundColor: palette.elevated,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
  },
  actionLabel: {
    ...type.kicker,
    color: palette.textMuted,
    marginBottom: 4,
  },
  actionText: {
    ...type.body,
    color: palette.text,
    lineHeight: 22,
  },

  // Locked
  lockedBlock: {
    marginTop: spacing.md,
  },
  previewWrapper: {
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  previewText: {
    ...type.body,
    color: palette.textSub,
    lineHeight: 23,
    opacity: 0.7,
  },
  previewAction: {
    ...type.body,
    color: palette.textSub,
    lineHeight: 22,
    opacity: 0.5,
    paddingVertical: 4,
  },
  unlockBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  unlockBtnText: {
    ...type.bodyMed,
    letterSpacing: 0.2,
  },
});
