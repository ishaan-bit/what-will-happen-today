/**
 * TarotCard — WWHT 2.1 occult-deck card.
 *
 * One card == one uploaded image/video bound to one life area, carrying a real
 * drawn tarot card (name + orientation) plus a teaser. Tapping a face-up card
 * opens the full-screen reading (CardModal).
 *
 * States:
 *   - Face-down (locked): a gilt-engraved tarot card BACK showing the CATEGORY
 *     sigil (never the drawn card's suit glyph — that was the old "hearts
 *     everywhere" bug). Unlock chips beneath: reveal via ad / ₹29 / ₹49.
 *   - Face-up: the bound media is the card art behind a gilt frame + name plate;
 *     tap opens the full reading.
 *
 * The reveal is a real 3D flip (Reanimated) on the art area.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  UIManager,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  cancelAnimation,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, spacing, radius, type, gradients, CATEGORY_META } from '@/utils/theme';
import { CATEGORY_SIGILS } from '@/utils/cosmic';
import { tap, expand as expandHaptic } from '@/utils/haptics';
import { track, Events } from '@/services/analyticsService';
import { HeroMedia } from '@/components/HeroMedia';
import { motionLite } from '@/utils/deviceTier';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = SCREEN_W - spacing.lg * 2;
const ART_H = Math.round(CARD_W * 0.82);

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
  canRevealWithAd = false,
  todayUnlockEnabled = true,
  thirtyDayUnlockEnabled = true,
  dailyPrice = '₹29',
  fullPrice = '₹49',
  onOpen,
  onRevealWithAd,
  onUnlockPress,
  onBuyDailyPress,
  onBuyFullPress,
}) {
  const meta = CATEGORY_META[category] || CATEGORY_META.mood;
  const sigil = CATEGORY_SIGILS[category] || CATEGORY_SIGILS.mood;
  const tarot = prediction?.tarot || null;
  const cardName = tarot?.cardName || sigil.name;
  const orientation = tarot?.orientation || 'upright';
  const reversed = orientation === 'reversed';
  const cardMeaning = tarot?.meaning?.surface || null;

  // Flip: 0 = card back, 1 = face (media + name plate).
  const flip = useSharedValue(isRevealed ? 1 : 0);
  const enter = useSharedValue(0);
  const breath = useSharedValue(0);   // slow living-deck breath (back)
  const ring = useSharedValue(0);     // arcane ring rotation (back)
  const shimmer = useSharedValue(0);  // gilt light sweep (back)
  const glow = useSharedValue(0);     // reveal burst when a card turns face-up
  const press = useSharedValue(0);    // tap feedback on a locked card
  const kb = useSharedValue(0);       // slow Ken Burns on the revealed art
  const prevRevealed = useRef(isRevealed);

  useEffect(() => {
    enter.value = withDelay(position * 110, withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) }));
  }, [enter, position]);

  useEffect(() => {
    flip.value = withTiming(isRevealed ? 1 : 0, { duration: 660, easing: Easing.inOut(Easing.cubic) });
  }, [isRevealed, flip]);

  // Continuous "living deck" motion — a breath always; the slow arcane-ring spin
  // only on capable devices (4 cards spinning at once is the heaviest back FX).
  useEffect(() => {
    breath.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true);
    if (!motionLite) {
      ring.value = withRepeat(withTiming(1, { duration: 30000, easing: Easing.linear }), -1, false);
    }
    return () => { cancelAnimation(breath); cancelAnimation(ring); };
  }, [breath, ring]);

  // A gilt light keeps sweeping across the back while it's face-down (skipped on
  // low-end devices to keep the four-card spread smooth).
  useEffect(() => {
    if (isRevealed || motionLite) { cancelAnimation(shimmer); shimmer.value = 0; return undefined; }
    shimmer.value = withDelay(
      position * 320,
      withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.cubic) }), -1, false),
    );
    return () => cancelAnimation(shimmer);
  }, [isRevealed, position, shimmer]);

  // A slow Ken Burns on the card art once it is face-up, so a revealed card
  // breathes instead of sitting static. Native/UI-thread (transform only).
  useEffect(() => {
    if (isRevealed && !motionLite) {
      kb.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
    } else {
      cancelAnimation(kb);
      kb.value = 0;
    }
    return () => cancelAnimation(kb);
  }, [isRevealed, kb]);

  // A burst of light the moment a card turns face-up.
  useEffect(() => {
    if (isRevealed && !prevRevealed.current) {
      glow.value = 0;
      glow.value = withSequence(
        withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 1150, easing: Easing.inOut(Easing.quad) }),
      );
    }
    prevRevealed.current = isRevealed;
  }, [isRevealed, glow]);

  const cardMotionStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [26, 0]) },
      {
        scale:
          interpolate(enter.value, [0, 1], [0.96, 1]) *
          interpolate(flip.value, [0, 0.5, 1], [1, 0.95, 1]) *
          interpolate(press.value, [0, 1], [1, 0.975]),
      },
    ],
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));

  const faceStyle = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
  }));

  // Back-of-card living motion ------------------------------------------------
  const breathGlowStyle = useAnimatedStyle(() => ({
    opacity: flip.value > 0.5 ? 0 : interpolate(breath.value, [0, 1], [0.16, 0.4]),
    transform: [{ scale: interpolate(breath.value, [0, 1], [0.9, 1.12]) }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: flip.value > 0.5 ? 0 : 0.5,
    transform: [{ rotate: `${interpolate(ring.value, [0, 1], [0, 360])}deg` }],
  }));

  const sigilStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breath.value, [0, 1], [0.98, 1.06]) }],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: flip.value > 0.5 ? 0 : interpolate(shimmer.value, [0, 0.2, 0.5, 0.8, 1], [0, 0.5, 0.95, 0.5, 0]),
    transform: [
      { translateX: interpolate(shimmer.value, [0, 1], [-CARD_W * 1.2, CARD_W * 1.2]) },
      { rotate: '20deg' },
    ],
  }));

  // Flip + reveal flourishes --------------------------------------------------
  const flashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(flip.value, [0, 0.4, 0.5, 0.6, 1], [0, 0, 0.5, 0, 0]),
  }));

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  // Ken Burns drift on the revealed art.
  const artKbStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(kb.value, [0, 1], [1.04, 1.12]) },
      { translateX: interpolate(kb.value, [0, 1], [-6, 6]) },
      { translateY: interpolate(kb.value, [0, 1], [4, -4]) },
    ],
  }));

  const handlePress = useCallback(() => {
    if (!isRevealed) {
      tap();
      press.value = withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 220 }));
      track(Events.LOCKED_CARD_TAP, { category });
      onUnlockPress?.();
      return;
    }
    expandHaptic();
    track(Events.READING_CATEGORY_VIEW, { category, surface: 'modal' });
    onOpen?.();
  }, [isRevealed, category, onUnlockPress, onOpen, press]);

  return (
    <Animated.View style={[styles.card, { borderColor: isRevealed ? meta.glow : palette.giltSoft }, cardMotionStyle]}>
      {/* Outer gilt frame line */}
      <View pointerEvents="none" style={styles.giltInset} />

      {/* ── Card art (flips) ─────────────────────────────────────────── */}
      <TouchableOpacity activeOpacity={0.92} onPress={handlePress} style={styles.artWrap}>
        {/* Back of card (face-down) — engraved occult deck back */}
        <Animated.View style={[styles.artFace, styles.cardBack, backStyle]}>
          <LinearGradient colors={gradients.cardBack} style={StyleSheet.absoluteFill} />
          {/* radial gold breath */}
          <LinearGradient
            colors={[`${meta.color}22`, 'transparent']}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.backFrameOuter, { borderColor: palette.giltSoft }]}>
            <View style={[styles.backFrameInner, { borderColor: `${meta.color}55` }]}>
              <View style={styles.sigilBox}>
                <Animated.View pointerEvents="none" style={[styles.glowCircle, { backgroundColor: meta.color }, breathGlowStyle]} />
                <Animated.View pointerEvents="none" style={[styles.arcaneRing, { borderColor: `${meta.color}66` }, ringStyle]} />
                <Animated.View pointerEvents="none" style={[styles.arcaneRingInner, { borderColor: `${meta.color}40` }, ringStyle]} />
                <Animated.Text style={[styles.backSigil, { color: meta.color }, sigilStyle]}>{meta.icon}</Animated.Text>
              </View>
              <Text style={[styles.backArea, { color: palette.accentBright }]}>{meta.label.toUpperCase()}</Text>
              <View style={[styles.backRule, { backgroundColor: palette.giltSoft }]} />
              <Text style={styles.backHidden}>Face-down</Text>
            </View>
          </View>
          {/* filigree corners */}
          <Text style={[styles.cTL, { color: palette.filigree }]}>✦</Text>
          <Text style={[styles.cTR, { color: palette.filigree }]}>✦</Text>
          <Text style={[styles.cBL, { color: palette.filigree }]}>✦</Text>
          <Text style={[styles.cBR, { color: palette.filigree }]}>✦</Text>
          {/* gilt light sweeping across the closed card */}
          <Animated.View pointerEvents="none" style={[styles.shimmerStrip, shimmerStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(241,217,164,0.18)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Animated.View>

        {/* Face of card (media art) */}
        <Animated.View style={[styles.artFace, faceStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, artKbStyle]}>
            <HeroMedia media={hero} style={StyleSheet.absoluteFill} audio="off" active={isRevealed} play={isRevealed} fallbackColor="#0c0810">
              <LinearGradient
                colors={[`${meta.color}1f`, '#0a0710']}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            </HeroMedia>
          </Animated.View>
          <LinearGradient colors={gradients.artScrim} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

          {/* Name plate */}
          <View style={styles.namePlate}>
            <View style={styles.namePlateRow}>
              <View style={[styles.areaChip, { borderColor: `${meta.color}66`, backgroundColor: `${meta.color}1f` }]}>
                <Text style={[styles.areaChipIcon, { color: meta.color }]}>{meta.icon}</Text>
                <Text style={[styles.areaChipText, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
              </View>
              {tarot ? (
                <View style={[styles.orientBadge, reversed && styles.orientBadgeRev]}>
                  <Text style={[styles.orientText, reversed && styles.orientTextRev]}>{orientationLabel(orientation)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cardName} numberOfLines={1}>{cardName}</Text>
          </View>
        </Animated.View>

        {/* White-gold flash at the midpoint of the flip */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flipFlash, flashStyle]} />
      </TouchableOpacity>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      {isRevealed ? (
        <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={styles.body}>
          {cardMeaning ? <Text style={[styles.cardMeaning, { color: meta.color }]}>{cardMeaning}</Text> : null}
          <Text style={styles.teaser} numberOfLines={2}>{prediction?.teaser}</Text>
          <View style={styles.openRow}>
            <Text style={[styles.openHint, { color: meta.color }]}>Open the full reading</Text>
            <Text style={[styles.openChevron, { color: meta.color }]}>›</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.lockedBody}>
          <Text style={styles.lockedTitle}>Turn this card to read it.</Text>
          <View style={styles.lockedActions}>
            {canRevealWithAd ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { expandHaptic(); onRevealWithAd?.(); }}
                style={[styles.chip, styles.adChip, { borderColor: palette.gilt, backgroundColor: palette.accentSoft }]}
              >
                <Text style={[styles.chipText, { color: palette.accentBright }]} numberOfLines={1}>✦ Reveal with an ad</Text>
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

      {/* Glow that flares around the frame as the card turns face-up */}
      <Animated.View pointerEvents="none" style={[styles.revealGlow, { borderColor: meta.glow, shadowColor: meta.color }, glowStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.md + 2,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  giltInset: {
    position: 'absolute',
    top: 5, left: 5, right: 5, bottom: 5,
    borderRadius: radius.lg - 5,
    borderWidth: 1,
    borderColor: 'rgba(212,175,110,0.14)',
    zIndex: 5,
  },
  artWrap: { width: '100%', height: ART_H },
  artFace: { ...StyleSheet.absoluteFillObject, backfaceVisibility: 'hidden', overflow: 'hidden' },
  cardBack: { alignItems: 'center', justifyContent: 'center' },
  backFrameOuter: {
    width: '78%', height: '80%',
    borderWidth: 1, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    padding: 8,
  },
  backFrameInner: {
    flex: 1, alignSelf: 'stretch',
    borderWidth: 1, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    gap: 8,
  },
  sigilBox: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  glowCircle: { position: 'absolute', top: 16, left: 16, width: 80, height: 80, borderRadius: 40 },
  arcaneRing: { position: 'absolute', top: 4, left: 4, width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderStyle: 'dashed' },
  arcaneRingInner: { position: 'absolute', top: 22, left: 22, width: 68, height: 68, borderRadius: 34, borderWidth: 1, borderStyle: 'dotted' },
  backSigil: { fontSize: 56, fontWeight: '300', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
  shimmerStrip: { position: 'absolute', top: -ART_H * 0.35, bottom: -ART_H * 0.35, left: 0, width: CARD_W * 0.32 },
  flipFlash: { backgroundColor: 'rgba(245,232,196,0.92)' },
  revealGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radius.lg, borderWidth: 2,
    shadowOpacity: 0.85, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
  },
  backArea: { ...type.kicker, fontSize: 11, letterSpacing: 3 },
  backRule: { width: 36, height: 1 },
  backHidden: { ...type.caption, color: palette.textMuted, fontStyle: 'italic', fontSize: 11, letterSpacing: 1 },
  cTL: { position: 'absolute', top: 12, left: 14, fontSize: 12 },
  cTR: { position: 'absolute', top: 12, right: 14, fontSize: 12 },
  cBL: { position: 'absolute', bottom: 12, left: 14, fontSize: 12 },
  cBR: { position: 'absolute', bottom: 12, right: 14, fontSize: 12 },
  namePlate: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  namePlateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  areaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  areaChipIcon: { fontSize: 12 },
  areaChipText: { ...type.kicker, fontSize: 9, letterSpacing: 1.5 },
  cardName: { ...type.cardName, color: palette.text, fontSize: 24, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  orientBadge: {
    borderWidth: 1, borderColor: palette.gilt, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: 'rgba(8,7,12,0.55)',
  },
  orientBadgeRev: { borderColor: 'rgba(224,138,106,0.6)' },
  orientText: { ...type.kicker, fontSize: 8.5, color: palette.accent },
  orientTextRev: { color: palette.danger },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.sm + 2, paddingBottom: spacing.md },
  cardMeaning: { ...type.caption, fontStyle: 'italic', marginBottom: spacing.xs, lineHeight: 18 },
  teaser: { ...type.serifBody, color: palette.text, lineHeight: 25 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  openHint: { ...type.kicker, fontSize: 10, letterSpacing: 1.5 },
  openChevron: { fontSize: 16, fontWeight: '700', marginTop: -2 },
  lockedBody: { paddingHorizontal: spacing.md, paddingTop: spacing.sm + 2, paddingBottom: spacing.md },
  lockedTitle: { ...type.caption, color: palette.textSub, textAlign: 'center', marginBottom: spacing.sm, fontStyle: 'italic' },
  lockedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center' },
  chip: {
    borderWidth: 1, borderColor: palette.glassBorder, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 3, paddingVertical: 8, minHeight: 38,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  adChip: { minWidth: 138 },
  chipText: { ...type.caption, color: palette.textSub, fontWeight: '700', fontSize: 12 },
});
