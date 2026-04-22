/**
 * SignalCard
 *
 * Free card: auto-expanded on mount, shows full reading content.
 * Locked card: shows teaser + unlock CTA.
 * Expanded content: full text → timing hint → action block → share.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, spacing, radius, type, CATEGORY_META } from '@/utils/theme';
import { tap, expand as expandHaptic, unlock as unlockHaptic } from '@/utils/haptics';
import { track, Events } from '@/services/analyticsService';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function SignalCard({ category, prediction, isFree, isUnlocked, onUnlockPress }) {
  const canRead = isFree || isUnlocked;
  // Free card auto-expands; locked card starts collapsed
  const [expanded, setExpanded] = useState(canRead);
  const meta = CATEGORY_META[category] || CATEGORY_META.mood;

  const handleHeaderPress = useCallback(() => {
    if (!canRead) {
      // Locked card tap → show paywall
      tap();
      track(Events.LOCKED_CARD_TAP, { category });
      onUnlockPress?.();
      return;
    }
    tap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    if (next) {
      track(isFree ? Events.FREE_CARD_EXPAND : Events.READING_CATEGORY_VIEW, { category });
    } else {
      track(Events.FREE_CARD_COLLAPSE, { category });
    }
  }, [canRead, expanded, category, isFree, onUnlockPress]);

  const handleShare = useCallback(async () => {
    if (!canRead) return;
    track(Events.SHARE_CARD_TAP, { category });
    unlockHaptic();
    try {
      const text = (prediction.shareSnippet || prediction.teaser) +
        '\n\n— What Will Happen Today';
      await Share.share({ message: text });
    } catch (_) {
      // Share dismissed or failed – no-op
    }
  }, [canRead, category, prediction]);

  if (!prediction) return null;

  const cardBorderColor = expanded && canRead ? `${meta.color}33` : palette.glassBorder;

  return (
    <View style={[styles.card, { borderColor: cardBorderColor }]}>
      {/* Top glow – visible when expanded */}
      {expanded && canRead && (
        <LinearGradient
          colors={[`${meta.color}18`, 'transparent']}
          style={styles.topGlow}
          pointerEvents="none"
        />
      )}

      {/* Card header – always visible */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={handleHeaderPress}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.categoryDot, { backgroundColor: `${meta.color}33` }]}>
            <Text style={[styles.categoryIcon, { color: meta.color }]}>{meta.icon}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.categoryLabel, { color: meta.color }]}>
              {meta.label.toUpperCase()}
            </Text>
            <Text style={styles.teaser} numberOfLines={expanded ? undefined : 2}>
              {prediction.teaser}
            </Text>
          </View>
        </View>

        {canRead ? (
          <Text style={styles.chevron}>{expanded ? '−' : '+'}</Text>
        ) : (
          <View style={[styles.lockBadge, { borderColor: `${meta.color}44` }]}>
            <Text style={[styles.lockText, { color: meta.color }]}>Unlock</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Expanded reading content */}
      {expanded && canRead && (
        <View style={styles.body}>
          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: `${meta.color}22` }]} />

          {/* Full insight */}
          <Text style={styles.fullText}>{prediction.full}</Text>

          {/* Timing hint */}
          {prediction.timing ? (
            <View style={styles.timingRow}>
              <Text style={[styles.timingIcon, { color: meta.color }]}>◈</Text>
              <Text style={styles.timingText}>{prediction.timing}</Text>
            </View>
          ) : null}

          {/* Action block */}
          {prediction.action ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                tap();
                track(Events.ACTION_CTA_TAP, { category });
              }}
              style={[styles.actionBlock, { borderLeftColor: meta.color }]}
            >
              <Text style={styles.actionLabel}>TODAY</Text>
              <Text style={styles.actionText}>{prediction.action}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Share button */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleShare}
            style={styles.shareRow}
          >
            <Text style={[styles.shareText, { color: palette.textMuted }]}>↗ Share signal</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Locked bottom CTA */}
      {!canRead && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            expandHaptic();
            track(Events.LOCKED_CARD_TAP, { category });
            onUnlockPress?.();
          }}
          style={[styles.lockedFooter, { borderColor: `${meta.color}33` }]}
        >
          <Text style={styles.lockedFooterText}>
            Unlock to read →
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    zIndex: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  categoryDot: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  categoryIcon: {
    fontSize: 14,
  },
  headerText: {
    flex: 1,
  },
  categoryLabel: {
    ...type.kicker,
    marginBottom: 4,
  },
  teaser: {
    ...type.bodyMed,
    color: palette.text,
    lineHeight: 22,
  },
  chevron: {
    fontSize: 20,
    color: palette.textMuted,
    lineHeight: 24,
    marginTop: 4,
    fontWeight: '300',
  },
  lockBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: 2,
  },
  lockText: {
    ...type.caption,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  divider: {
    height: 1,
    marginBottom: spacing.md,
  },
  fullText: {
    ...type.body,
    color: palette.textSub,
    marginBottom: spacing.md,
  },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.md,
  },
  timingIcon: {
    fontSize: 12,
  },
  timingText: {
    ...type.caption,
    color: palette.textMuted,
    fontStyle: 'italic',
    flex: 1,
  },
  actionBlock: {
    borderLeftWidth: 3,
    paddingLeft: spacing.sm + 2,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  actionLabel: {
    ...type.kicker,
    color: palette.textMuted,
    marginBottom: 3,
  },
  actionText: {
    ...type.bodyMed,
    color: palette.text,
  },
  shareRow: {
    alignSelf: 'flex-end',
    paddingTop: spacing.xs,
  },
  shareText: {
    ...type.caption,
  },
  lockedFooter: {
    borderTopWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  lockedFooterText: {
    ...type.caption,
    color: palette.textMuted,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
