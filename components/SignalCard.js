/**
 * SignalCard — tarot-style reading card.
 *
 * Collapsed: face-up sigil card showing category glyph + teaser.
 * Expanded: reveals the full reading with timing, action, share.
 * Locked:    face-down with "Unlock" affordance + bottom CTA.
 *
 * Bug fixes vs prior version:
 *   - Renders a placeholder shell when prediction is missing (was returning null
 *     → caused the "blank box under THIS SHOWED UP FOR YOU TODAY").
 *   - Border is no longer animated during collapse (was causing whole-card vanish
 *     because the Animated.Value reset to 0 raced with LayoutAnimation).
 *   - revealAnim is no longer reset before the body unmounts (was causing a
 *     1-frame opacity:0 flash on collapse).
 */

import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  LayoutAnimation,
  UIManager,
  Platform,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, spacing, radius, type, CATEGORY_META } from '@/utils/theme';
import { CATEGORY_SIGILS } from '@/utils/cosmic';
import { tap, expand as expandHaptic, unlock as unlockHaptic } from '@/utils/haptics';
import { track, Events } from '@/services/analyticsService';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function SignalCard({ category, prediction, isFree, isUnlocked, onUnlockPress }) {
  const canRead = isFree || isUnlocked;
  const [expanded, setExpanded] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const meta = CATEGORY_META[category] || CATEGORY_META.mood;
  const sigil = CATEGORY_SIGILS[category] || CATEGORY_SIGILS.mood;
  const revealAnim = useRef(new Animated.Value(0)).current;

  // ── Fallback shell — no prediction loaded yet (don't render an empty box) ──
  if (!prediction) {
    return (
      <View style={[styles.card, styles.shellCard]}>
        <View style={styles.shellHeader}>
          <View style={[styles.glyphBadge, { borderColor: `${meta.color}33` }]}>
            <Text style={[styles.glyphText, { color: meta.color }]}>{sigil.glyph}</Text>
          </View>
          <View style={styles.shellTextWrap}>
            <Text style={[styles.categoryLabel, { color: meta.color }]}>
              {meta.label.toUpperCase()}
            </Text>
            <Text style={styles.shellSubtle}>Drawing your card…</Text>
          </View>
        </View>
      </View>
    );
  }

  const triggerReveal = useCallback(() => {
    setRevealing(true);
    setTimeout(() => {
      LayoutAnimation.configureNext({
        duration: 280,
        update: { type: 'easeInEaseOut' },
        create: { type: 'easeInEaseOut', property: 'opacity' },
      });
      setExpanded(true);
      setRevealing(false);
      revealAnim.setValue(0);
      Animated.timing(revealAnim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }).start();
    }, 280);
  }, [revealAnim]);

  const handleHeaderPress = useCallback(() => {
    if (!canRead) {
      tap();
      track(Events.LOCKED_CARD_TAP, { category });
      onUnlockPress?.();
      return;
    }
    tap();
    if (expanded) {
      // Collapse — fade body out THEN remove
      Animated.timing(revealAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }).start(() => {
        LayoutAnimation.configureNext({
          duration: 220,
          update: { type: 'easeInEaseOut' },
        });
        setExpanded(false);
      });
      track(Events.FREE_CARD_COLLAPSE, { category });
      return;
    }
    track(isFree ? Events.FREE_CARD_EXPAND : Events.READING_CATEGORY_VIEW, { category });
    triggerReveal();
  }, [canRead, expanded, category, isFree, onUnlockPress, triggerReveal, revealAnim]);

  const handleShare = useCallback(async () => {
    if (!canRead) return;
    track(Events.SHARE_CARD_TAP, { category });
    unlockHaptic();
    try {
      const text = (prediction.shareSnippet || prediction.teaser) +
        '\n\n— What Will Happen Today\nYour daily reading: https://wwht.app';
      await Share.share({ message: text });
    } catch (_) {}
  }, [canRead, category, prediction]);

  const borderColor = expanded && canRead ? `${meta.color}88` : palette.glassBorder;

  return (
    <View style={[styles.card, { borderColor }]}>
      {/* Tarot corner sigils — always visible, very subtle */}
      <Text style={[styles.cornerSigilTL, { color: `${meta.color}55` }]}>✦</Text>
      <Text style={[styles.cornerSigilTR, { color: `${meta.color}55` }]}>✦</Text>

      {/* Top glow when expanded */}
      {expanded && canRead && (
        <LinearGradient
          colors={[`${meta.color}22`, 'transparent']}
          style={styles.topGlow}
          pointerEvents="none"
        />
      )}

      {/* Header — always tappable */}
      <TouchableOpacity
        activeOpacity={0.78}
        onPress={handleHeaderPress}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          {/* Big sigil badge — gives the tarot feel */}
          <View style={[styles.glyphBadge, { borderColor: `${meta.color}55`, backgroundColor: `${meta.color}11` }]}>
            <Text style={[styles.glyphText, { color: meta.color }]}>{sigil.glyph}</Text>
          </View>

          <View style={styles.headerText}>
            <Text style={[styles.categoryLabel, { color: meta.color }]}>
              {meta.label.toUpperCase()} · {sigil.name.toUpperCase()}
            </Text>
            <Text style={styles.teaser} numberOfLines={expanded ? undefined : 2}>
              {prediction.teaser}
            </Text>
          </View>
        </View>

        {canRead ? (
          <Text style={[styles.chevron, revealing && styles.chevronRevealing]}>
            {revealing ? '·' : expanded ? '−' : '+'}
          </Text>
        ) : (
          <View style={[styles.lockBadge, { borderColor: `${meta.color}55` }]}>
            <Text style={[styles.lockText, { color: meta.color }]}>Reveal</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Expanded reading */}
      {expanded && canRead && (
        <Animated.View style={[styles.body, { opacity: revealAnim }]}>
          <View style={[styles.divider, { backgroundColor: `${meta.color}33` }]} />

          <Text style={styles.fullText}>{prediction.full}</Text>

          {prediction.timing ? (
            <View style={styles.timingRow}>
              <Text style={[styles.timingIcon, { color: meta.color }]}>◈</Text>
              <Text style={styles.timingText}>{prediction.timing}</Text>
            </View>
          ) : null}

          {prediction.action ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                tap();
                track(Events.ACTION_CTA_TAP, { category });
              }}
              style={[styles.actionBlock, { borderLeftColor: meta.color }]}
            >
              <Text style={styles.actionLabel}>NOTICE TODAY</Text>
              <Text style={styles.actionText}>{prediction.action}</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity activeOpacity={0.7} onPress={handleShare} style={styles.shareRow}>
            <Text style={[styles.shareText, { color: meta.color }]}>↗ Send this to someone</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Locked footer CTA */}
      {!canRead && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            expandHaptic();
            track(Events.LOCKED_CARD_TAP, { category });
            onUnlockPress?.();
          }}
          style={[styles.lockedFooter, { borderColor: `${meta.color}33` }]}
        >
          <Text style={styles.lockedFooterText}>
            See what's predicted →
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
    minHeight: 96,
  },
  shellCard: {
    opacity: 0.65,
  },
  shellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  shellTextWrap: {
    flex: 1,
  },
  shellSubtle: {
    ...type.caption,
    color: palette.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    zIndex: 0,
  },
  cornerSigilTL: {
    position: 'absolute',
    top: 8,
    left: 10,
    fontSize: 10,
    zIndex: 2,
  },
  cornerSigilTR: {
    position: 'absolute',
    top: 8,
    right: 10,
    fontSize: 10,
    zIndex: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md + 6,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
  },
  glyphBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
    marginTop: 2,
  },
  glyphText: {
    fontSize: 22,
    fontWeight: '300',
  },
  headerText: {
    flex: 1,
    paddingTop: 2,
  },
  categoryLabel: {
    ...type.kicker,
    fontSize: 9,
    marginBottom: 5,
  },
  teaser: {
    ...type.bodyMed,
    color: palette.text,
    lineHeight: 22,
  },
  chevron: {
    fontSize: 22,
    color: palette.textMuted,
    lineHeight: 26,
    marginTop: 6,
    fontWeight: '200',
    paddingHorizontal: 6,
  },
  chevronRevealing: {
    color: palette.accent,
    fontSize: 24,
  },
  lockBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    marginTop: 4,
  },
  lockText: {
    ...type.caption,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.5,
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
    lineHeight: 24,
  },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  timingIcon: {
    fontSize: 11,
    marginTop: 3,
    flexShrink: 0,
  },
  timingText: {
    ...type.caption,
    color: palette.textMuted,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 18,
  },
  actionBlock: {
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderRadius: 4,
  },
  actionLabel: {
    ...type.kicker,
    fontSize: 9,
    color: palette.textDim,
    marginBottom: 4,
  },
  actionText: {
    ...type.caption,
    color: palette.textSub,
    lineHeight: 19,
  },
  shareRow: {
    alignItems: 'flex-start',
    marginTop: spacing.xs,
  },
  shareText: {
    ...type.caption,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  lockedFooter: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  lockedFooterText: {
    ...type.caption,
    color: palette.textMuted,
    fontWeight: '500',
  },
});
