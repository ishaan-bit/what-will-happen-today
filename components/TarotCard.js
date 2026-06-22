/**
 * TarotCard — WWHT 2.0 card.
 *
 * One card == one uploaded image bound to one life area, carrying a real
 * drawn tarot card (name + orientation + canonical meaning) plus the
 * generated reading underneath.
 *
 * States:
 *   - Face-down (locked): ornate card back; unlock via ₹29 / ₹49 / one ad.
 *   - Face-up (free / paid / ad-revealed): the bound image is the card art,
 *     a name plate shows the drawn card, tap to expand the full reading.
 *
 * The reveal is a real 3D flip (Reanimated) on the fixed-size art area; the
 * reading body below animates open with LayoutAnimation.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Share,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, spacing, radius, type, CATEGORY_META } from '@/utils/theme';
import { CATEGORY_SIGILS } from '@/utils/cosmic';
import { getDeeperMeaning } from '@/utils/deeperMeaning';
import { tap, expand as expandHaptic, unlock as unlockHaptic } from '@/utils/haptics';
import { track, Events } from '@/services/analyticsService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_W = Dimensions.get('window').width;
const ART_W = SCREEN_W - spacing.lg * 2;
const ART_H = Math.round(ART_W * 0.64);

function orientationLabel(orientation) {
  return orientation === 'reversed' ? 'Reversed' : 'Upright';
}

export function TarotCard({
  category,
  prediction,
  hero,
  position = 0,
  isFree = false,
  isRevealed = false,
  isPaidEntitled = false,
  deeperEnabled = true,
  canRevealWithAd = false,
  todayUnlockEnabled = true,
  thirtyDayUnlockEnabled = true,
  dailyPrice = '₹29',
  fullPrice = '₹49',
  highlighted = false,
  onRevealWithAd,
  onUnlockPress,
  onBuyDailyPress,
  onBuyFullPress,
}) {
  const meta = CATEGORY_META[category] || CATEGORY_META.mood;
  const sigil = CATEGORY_SIGILS[category] || CATEGORY_SIGILS.mood;
  const tarot = prediction?.tarot || null;
  const glyph = tarot?.glyph || sigil.glyph;
  const cardName = tarot?.cardName || sigil.name;
  const orientation = tarot?.orientation || 'upright';
  const reversed = orientation === 'reversed';
  const keywords = tarot?.keywords || [];
  const cardMeaning = tarot?.meaning?.surface || null;
  const deeper = getDeeperMeaning(category, prediction);

  const [expanded, setExpanded] = useState(false);

  // Flip: 0 = card back, 1 = face (image + reading).
  const flip = useSharedValue(isRevealed ? 1 : 0);
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withDelay(position * 90, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [enter, position]);

  useEffect(() => {
    flip.value = withTiming(isRevealed ? 1 : 0, {
      duration: 620,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [isRevealed, flip]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: interpolate(enter.value, [0, 1], [18, 0]) }],
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [
      { perspective: 900 },
      { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` },
    ],
  }));

  const faceStyle = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [
      { perspective: 900 },
      { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` },
    ],
  }));

  const handlePress = useCallback(() => {
    if (!isRevealed) {
      tap();
      track(Events.LOCKED_CARD_TAP, { category });
      onUnlockPress?.();
      return;
    }
    tap();
    LayoutAnimation.configureNext({
      duration: 260,
      update: { type: 'easeInEaseOut' },
      create: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setExpanded((v) => !v);
    track(expanded ? Events.FREE_CARD_COLLAPSE : Events.READING_CATEGORY_VIEW, { category });
  }, [isRevealed, expanded, category, onUnlockPress]);

  const handleShare = useCallback(async (variant) => {
    if (!isRevealed || !prediction) return;
    track(Events.SHARE_CARD_TAP, { category, variant: variant || 'default' });
    unlockHaptic();
    const snippet = prediction.shareSnippet || prediction.teaser || '';
    const cardLine = tarot ? `${cardName}${reversed ? ' (Reversed)' : ''}\n` : '';
    let prefix = '';
    if (variant === 'accurate') prefix = "This card was too accurate.\n\n";
    else if (variant === 'reminder') prefix = 'I drew this and thought of you.\n\n';
    const text = `${prefix}${cardLine}${snippet}\n\nWhat Will Happen Today`;
    try { await Share.share({ message: text }); } catch (_) {}
  }, [isRevealed, prediction, category, tarot, cardName, reversed]);

  const artUri = hero
    ? (hero.mediaType === 'video' ? (hero.posterUrl || null) : (hero.url || null))
    : null;

  const borderColor = highlighted
    ? palette.accent
    : (isRevealed ? `${meta.color}55` : `${meta.color}40`);

  return (
    <Animated.View style={[styles.card, { borderColor }, enterStyle]}>
      {/* ── Card art (flips) ───────────────────────────────────────── */}
      <TouchableOpacity activeOpacity={0.9} onPress={handlePress} style={styles.artWrap}>
        {/* Back of card (face-down) */}
        <Animated.View style={[styles.artFace, styles.cardBack, backStyle]}>
          <LinearGradient
            colors={['#10131f', '#0a0c15']}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.backInner, { borderColor: `${meta.color}33` }]}>
            <Text style={[styles.backGlyph, { color: `${meta.color}cc` }]}>{glyph}</Text>
            <Text style={[styles.backLabel, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
            <Text style={styles.backHidden}>The card is face-down</Text>
          </View>
          {/* corner flourishes */}
          <Text style={[styles.cornerTL, { color: `${meta.color}66` }]}>✦</Text>
          <Text style={[styles.cornerBR, { color: `${meta.color}66` }]}>✦</Text>
        </Animated.View>

        {/* Face of card (image art) */}
        <Animated.View style={[styles.artFace, faceStyle]}>
          {artUri ? (
            <Image source={{ uri: artUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient colors={[`${meta.color}22`, '#0a0c15']} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['rgba(7,8,15,0.05)', 'rgba(7,8,15,0.35)', 'rgba(7,8,15,0.92)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* Name plate */}
          <View style={styles.namePlate}>
            <View style={styles.namePlateRow}>
              <Text style={[styles.cardGlyph, { color: meta.color }]}>{glyph}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.areaLabel, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
                <Text style={styles.cardName} numberOfLines={1}>{cardName}</Text>
              </View>
              {tarot ? (
                <View style={[styles.orientBadge, reversed && styles.orientBadgeRev]}>
                  <Text style={[styles.orientText, reversed && styles.orientTextRev]}>{orientationLabel(orientation)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>

      {/* ── Body ───────────────────────────────────────────────────── */}
      {isRevealed ? (
        <View style={styles.body}>
          {cardMeaning ? (
            <Text style={[styles.cardMeaning, { color: meta.color }]}>{cardMeaning}</Text>
          ) : null}
          <Text style={styles.teaser}>{prediction?.teaser}</Text>

          {expanded ? (
            <View style={styles.expanded}>
              {keywords.length ? (
                <View style={styles.keywordRow}>
                  {keywords.slice(0, 4).map((k) => (
                    <View key={k} style={[styles.keywordChip, { borderColor: `${meta.color}44` }]}>
                      <Text style={[styles.keywordText, { color: meta.color }]}>{k}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {prediction?.full ? <Text style={styles.fullText}>{prediction.full}</Text> : null}

              {prediction?.punch ? (
                <View style={[styles.punchBlock, { borderLeftColor: meta.color }]}>
                  <Text style={styles.punchText}>"{prediction.punch}"</Text>
                </View>
              ) : null}

              {prediction?.timing ? (
                <View style={styles.timingRow}>
                  <Text style={[styles.timingIcon, { color: meta.color }]}>◈</Text>
                  <Text style={styles.timingText}>{prediction.timing}</Text>
                </View>
              ) : null}

              {prediction?.action ? (
                <View style={[styles.actionBlock, { borderLeftColor: meta.color }]}>
                  <Text style={styles.actionLabel}>WHAT TO DO WHEN IT HAPPENS</Text>
                  <Text style={styles.actionText}>{prediction.action}</Text>
                </View>
              ) : null}

              {deeperEnabled ? (
                <View style={[styles.deeperBox, { borderColor: `${meta.color}33` }]}>
                  <Text style={[styles.deeperKicker, { color: meta.color }]}>BENEATH THE CARD</Text>
                  <View style={styles.deeperGrid}>
                    <DeeperItem label="Avoid" text={deeper.avoid} />
                    <DeeperItem label="Say yes to" text={deeper.sayYesTo} />
                    <DeeperItem label="Small move" text={deeper.move} />
                  </View>
                </View>
              ) : null}

              <View style={styles.shareRow}>
                <ShareChip color={meta.color} label="↗ Share" onPress={() => handleShare('default')} solid />
                <ShareChip color={meta.color} label="Too accurate" onPress={() => handleShare('accurate')} />
                <ShareChip color={meta.color} label="Thought of you" onPress={() => handleShare('reminder')} />
              </View>
            </View>
          ) : (
            <Text style={styles.expandHint}>Tap to read the full draw</Text>
          )}
        </View>
      ) : (
        <View style={styles.lockedBody}>
          <Text style={styles.lockedTitle}>This card is still face-down.</Text>
          <View style={styles.lockedActions}>
            {canRevealWithAd ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { expandHaptic(); onRevealWithAd?.(); }}
                style={[styles.chip, styles.adChip, { borderColor: `${meta.color}77`, backgroundColor: `${meta.color}14` }]}
              >
                <Text style={[styles.chipText, { color: meta.color }]} numberOfLines={1}>Flip with an ad</Text>
              </TouchableOpacity>
            ) : null}
            {todayUnlockEnabled ? (
              <TouchableOpacity activeOpacity={0.85} onPress={onBuyDailyPress || onUnlockPress} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>Unlock today {dailyPrice}</Text>
              </TouchableOpacity>
            ) : null}
            {thirtyDayUnlockEnabled ? (
              <TouchableOpacity activeOpacity={0.85} onPress={onBuyFullPress || onUnlockPress} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>30 days {fullPrice}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

function DeeperItem({ label, text }) {
  return (
    <View style={styles.deeperItem}>
      <Text style={styles.deeperLabel}>{label}</Text>
      <Text style={styles.deeperText}>{text}</Text>
    </View>
  );
}

function ShareChip({ color, label, onPress, solid }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.shareChip, { borderColor: solid ? `${color}66` : `${color}33` }]}
    >
      <Text style={[styles.shareChipText, solid && { color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 3,
  },
  artWrap: {
    width: '100%',
    height: ART_H,
  },
  artFace: {
    ...StyleSheet.absoluteFillObject,
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
  },
  cardBack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backInner: {
    width: '74%',
    height: '74%',
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  backGlyph: { fontSize: 46, fontWeight: '300' },
  backLabel: { ...type.kicker, fontSize: 10, letterSpacing: 2.5 },
  backHidden: { ...type.caption, color: palette.textMuted, fontStyle: 'italic', fontSize: 11 },
  cornerTL: { position: 'absolute', top: 12, left: 14, fontSize: 12 },
  cornerBR: { position: 'absolute', bottom: 12, right: 14, fontSize: 12 },
  namePlate: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm + 2,
  },
  namePlateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardGlyph: { fontSize: 26, fontWeight: '300' },
  areaLabel: { ...type.kicker, fontSize: 9, marginBottom: 2 },
  cardName: { ...type.title, color: palette.text, fontSize: 20 },
  orientBadge: {
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.5)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: 'rgba(7,8,15,0.5)',
  },
  orientBadgeRev: { borderColor: 'rgba(232,115,106,0.55)' },
  orientText: { ...type.kicker, fontSize: 8.5, color: palette.accent },
  orientTextRev: { color: palette.danger },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.md,
  },
  cardMeaning: {
    ...type.caption,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
    lineHeight: 18,
  },
  teaser: { ...type.bodyMed, color: palette.text, lineHeight: 23 },
  expandHint: {
    ...type.caption,
    color: palette.textMuted,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  expanded: { marginTop: spacing.sm },
  keywordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm + 2 },
  keywordChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  keywordText: { ...type.caption, fontSize: 11, fontWeight: '600' },
  fullText: { ...type.body, color: palette.textSub, lineHeight: 24, marginBottom: spacing.md },
  punchBlock: { borderLeftWidth: 3, paddingLeft: spacing.sm + 2, paddingVertical: spacing.xs + 2, marginBottom: spacing.md },
  punchText: { ...type.bodyMed, color: palette.text, fontStyle: 'italic', lineHeight: 22 },
  timingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginBottom: spacing.md, paddingHorizontal: spacing.xs },
  timingIcon: { fontSize: 11, marginTop: 3 },
  timingText: { ...type.caption, color: palette.textMuted, fontStyle: 'italic', flex: 1, lineHeight: 18 },
  actionBlock: { borderLeftWidth: 3, paddingLeft: spacing.sm, paddingVertical: spacing.xs + 2, marginBottom: spacing.md, backgroundColor: 'rgba(255,255,255,0.025)', borderRadius: 4 },
  actionLabel: { ...type.kicker, fontSize: 9, color: palette.textDim, marginBottom: 4 },
  actionText: { ...type.caption, color: palette.textSub, lineHeight: 19 },
  deeperBox: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md, backgroundColor: 'rgba(255,255,255,0.025)' },
  deeperKicker: { ...type.kicker, fontSize: 9, marginBottom: spacing.xs },
  deeperGrid: { gap: spacing.xs },
  deeperItem: { gap: 2 },
  deeperLabel: { ...type.kicker, color: palette.textDim, fontSize: 8, letterSpacing: 1.2 },
  deeperText: { ...type.caption, color: palette.textSub, lineHeight: 18 },
  shareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  shareChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 6 },
  shareChipText: { ...type.caption, color: palette.textSub, fontSize: 12 },
  lockedBody: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.md,
  },
  lockedTitle: { ...type.caption, color: palette.textSub, textAlign: 'center', marginBottom: spacing.sm },
  lockedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center' },
  chip: {
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 3,
    paddingVertical: 8,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  adChip: { minWidth: 108 },
  chipText: { ...type.caption, color: palette.textSub, fontWeight: '700', fontSize: 12 },
});
