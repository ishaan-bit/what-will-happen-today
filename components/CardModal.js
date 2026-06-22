/**
 * CardModal — full-screen cinematic takeover for one revealed card.
 *
 * The bound image/video is a PARALLAX header (slow Ken Burns drift, mp4 plays
 * with a tap-for-sound control); the full reading rises over it on a single
 * scroll, its sections cascading in. Opened by tapping a face-up TarotCard.
 * Swipe down from the top, tap ✕, or press back to close.
 *
 * NOTE: the reading lives in ONE Animated.ScrollView (not a flex'd inner
 * ScrollView) so it is always scrollable — the previous nested ScrollView had
 * no bounded height and grew to its content, so it never scrolled.
 */

import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Easing,
  TouchableOpacity,
  Dimensions,
  Share,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, spacing, radius, type, gradients, CATEGORY_META } from '@/utils/theme';
import { CATEGORY_SIGILS } from '@/utils/cosmic';
import { getDeeperMeaning } from '@/utils/deeperMeaning';
import { tap, unlock as unlockHaptic } from '@/utils/haptics';
import { track, Events } from '@/services/analyticsService';
import { HeroMedia } from '@/components/HeroMedia';
import { Embers } from '@/components/Embers';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const MEDIA_H = Math.round(SCREEN_H * 0.52);

function orientationLabel(o) { return o === 'reversed' ? 'Reversed' : 'Upright'; }

function suitLabel(tarot) {
  if (!tarot) return null;
  if (tarot.arcana === 'major') return 'Major Arcana';
  if (!tarot.suit) return null;
  return tarot.suit.charAt(0).toUpperCase() + tarot.suit.slice(1);
}

/**
 * A reading section that fades + rises in, staggered by `index`, off the single
 * `reveal` 0→1 value. Native-driven; the cascade reads like the meaning is
 * being dealt out beneath the card.
 */
function Section({ reveal, index = 0, style, children }) {
  const start = Math.min(index * 0.06, 0.5);
  const t = reveal.interpolate({
    inputRange: [start, Math.min(start + 0.45, 1)],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      style={[
        style,
        { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function CardModal({ visible, card, onClose, deeperEnabled = true }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;    // 0 closed → 1 open
  const drag = useRef(new Animated.Value(0)).current;    // downward drag px
  const scrollY = useRef(new Animated.Value(0)).current; // reading scroll offset
  const reveal = useRef(new Animated.Value(0)).current;  // staggered content in
  const sweep = useRef(new Animated.Value(0)).current;   // one-shot gilt light sweep
  const kb = useRef(new Animated.Value(0)).current;      // slow Ken Burns loop
  const atTopRef = useRef(true);
  const kbLoopRef = useRef(null);

  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      scrollY.setValue(0);
      reveal.setValue(0);
      sweep.setValue(0);
      kb.setValue(0);
      atTopRef.current = true;

      Animated.spring(anim, { toValue: 1, tension: 60, friction: 11, useNativeDriver: true }).start();
      Animated.timing(reveal, { toValue: 1, duration: 780, delay: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      Animated.timing(sweep, { toValue: 1, duration: 1150, delay: 240, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();

      kbLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(kb, { toValue: 1, duration: 11000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(kb, { toValue: 0, duration: 11000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      kbLoopRef.current.start();
      return () => kbLoopRef.current?.stop?.();
    }
    anim.setValue(0);
    kbLoopRef.current?.stop?.();
    return undefined;
  }, [visible, anim, drag, scrollY, reveal, sweep, kb]);

  const close = () => {
    tap();
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onClose?.());
  };

  // Swipe down to dismiss — only engages at the top of the reading, so it never
  // steals a normal scroll. Below the top, the ScrollView owns the gesture.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => atTopRef.current && g.dy > 14 && g.dy > Math.abs(g.dx) * 1.4,
      onPanResponderMove: (_, g) => { if (g.dy > 0) drag.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 140 || g.vy > 1.1) {
          Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onClose?.());
        } else {
          Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true, listener: (e) => { atTopRef.current = e.nativeEvent.contentOffset.y <= 2; } }
  );

  if (!card) return null;

  const { category, prediction, hero } = card;
  const meta = CATEGORY_META[category] || CATEGORY_META.mood;
  const sigil = CATEGORY_SIGILS[category] || CATEGORY_SIGILS.mood;
  const tarot = prediction?.tarot || null;
  const cardName = tarot?.cardName || sigil.name;
  const orientation = tarot?.orientation || 'upright';
  const reversed = orientation === 'reversed';
  const keywords = tarot?.keywords || [];
  const cardMeaning = tarot?.meaning?.surface || null;
  const deeper = getDeeperMeaning(category, prediction);

  const handleShare = async (variant) => {
    if (!prediction) return;
    track(Events.SHARE_CARD_TAP, { category, variant: variant || 'default', surface: 'modal' });
    unlockHaptic();
    const snippet = prediction.shareSnippet || prediction.teaser || '';
    const cardLine = tarot ? `${cardName}${reversed ? ' (Reversed)' : ''}\n` : '';
    let prefix = '';
    if (variant === 'accurate') prefix = 'This card was too accurate.\n\n';
    else if (variant === 'reminder') prefix = 'I drew this and thought of you.\n\n';
    try { await Share.share({ message: `${prefix}${cardLine}${snippet}\n\nWhat Will Happen Today` }); } catch (_) {}
  };

  // Sheet entrance + drag; backdrop fades as you drag the sheet away.
  const sheetTranslate = Animated.add(
    anim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H * 0.10, 0] }),
    drag,
  );
  const sheetScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const backdropOpacity = Animated.multiply(
    anim,
    drag.interpolate({ inputRange: [0, SCREEN_H * 0.5], outputRange: [1, 0.2], extrapolate: 'clamp' }),
  );

  // Parallax: the media lags the scroll, a Ken Burns breath drifts the frame,
  // and a scrim deepens so the reading owns focus as you dive in.
  const mediaTranslate = scrollY.interpolate({ inputRange: [0, MEDIA_H], outputRange: [0, MEDIA_H * 0.45], extrapolateLeft: 'clamp', extrapolateRight: 'extend' });
  const kbScale = kb.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1.11] });
  const kbDrift = kb.interpolate({ inputRange: [0, 1], outputRange: [-7, 7] });
  const scrimDeepen = scrollY.interpolate({ inputRange: [0, MEDIA_H * 0.7], outputRange: [0, 0.5], extrapolate: 'clamp' });
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-SCREEN_W * 1.2, SCREEN_W * 1.2] });
  const plateRise = reveal.interpolate({ inputRange: [0, 0.6], outputRange: [18, 0], extrapolate: 'clamp' });

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={close}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
        <LinearGradient colors={gradients.modalWash} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: sheetTranslate }, { scale: sheetScale }] }]}
        {...panResponder.panHandlers}
      >
        <Animated.ScrollView
          style={StyleSheet.absoluteFill}
          bounces={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        >
          {/* ── Media (parallax header) ───────────────────────── */}
          <Animated.View style={[styles.mediaWrap, { height: MEDIA_H, transform: [{ translateY: mediaTranslate }] }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: kbScale }, { translateY: kbDrift }] }]}>
              <HeroMedia media={hero} style={StyleSheet.absoluteFill} audio="toggle" play fallbackColor="#0c0810" />
            </Animated.View>

            <LinearGradient
              colors={['rgba(6,5,10,0.35)', 'rgba(6,5,10,0)', 'rgba(6,5,10,0.35)', 'rgba(8,7,12,0.98)']}
              locations={[0, 0.25, 0.6, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#06050a', opacity: scrimDeepen }]} />

            {/* embers rising over the card art */}
            <Embers count={9} width={SCREEN_W} height={MEDIA_H} seed={3} />

            {/* one-shot gilt light sweep on open */}
            <Animated.View pointerEvents="none" style={[styles.sweep, { transform: [{ translateX: sweepX }, { rotate: '18deg' }] }]}>
              <LinearGradient
                colors={['transparent', 'rgba(241,217,164,0.20)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            <View pointerEvents="none" style={styles.mediaGilt} />
            <View style={[styles.grip, { top: insets.top + 8 }]} />

            <Animated.View style={[styles.mediaPlate, { opacity: reveal, transform: [{ translateY: plateRise }] }]}>
              <View style={styles.plateRow}>
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
              <Text style={styles.cardName}>{cardName}</Text>
              {suitLabel(tarot) ? <Text style={styles.suitLine}>{suitLabel(tarot)} · today's draw</Text> : null}
            </Animated.View>
          </Animated.View>

          {/* ── Reading (rises over the media) ────────────────── */}
          <View style={styles.bodyWrap}>
            <View style={styles.bodyHandle} />

            <Section reveal={reveal} index={0}>
              {cardMeaning ? <Text style={[styles.meaning, { color: meta.color }]}>{cardMeaning}</Text> : null}
              <Text style={styles.teaser}>{prediction?.teaser}</Text>
            </Section>

            {keywords.length ? (
              <Section reveal={reveal} index={1} style={styles.keywordRow}>
                {keywords.slice(0, 4).map((k) => (
                  <View key={k} style={[styles.keywordChip, { borderColor: `${meta.color}55` }]}>
                    <Text style={[styles.keywordText, { color: meta.color }]}>{k}</Text>
                  </View>
                ))}
              </Section>
            ) : null}

            {prediction?.full ? (
              <Section reveal={reveal} index={2}>
                <Text style={styles.full}>{prediction.full}</Text>
              </Section>
            ) : null}

            {prediction?.punch ? (
              <Section reveal={reveal} index={3} style={[styles.punchBlock, { borderLeftColor: meta.color }]}>
                <Text style={styles.punch}>"{prediction.punch}"</Text>
              </Section>
            ) : null}

            {prediction?.timing ? (
              <Section reveal={reveal} index={4} style={styles.timingRow}>
                <Text style={[styles.timingIcon, { color: meta.color }]}>☽</Text>
                <Text style={styles.timing}>{prediction.timing}</Text>
              </Section>
            ) : null}

            {prediction?.action ? (
              <Section reveal={reveal} index={5} style={[styles.actionBlock, { borderLeftColor: meta.color }]}>
                <Text style={styles.actionLabel}>WHAT TO DO WHEN IT HAPPENS</Text>
                <Text style={styles.actionText}>{prediction.action}</Text>
              </Section>
            ) : null}

            {deeperEnabled ? (
              <Section reveal={reveal} index={6} style={[styles.deeperBox, { borderColor: `${meta.color}3a` }]}>
                <Text style={[styles.deeperKicker, { color: meta.color }]}>BENEATH THE CARD</Text>
                <DeeperItem label="Avoid" text={deeper.avoid} />
                <DeeperItem label="Say yes to" text={deeper.sayYesTo} />
                <DeeperItem label="Small move" text={deeper.move} />
              </Section>
            ) : null}

            <Section reveal={reveal} index={7} style={styles.shareRow}>
              <ShareChip color={meta.color} label="↗ Share" onPress={() => handleShare('default')} solid />
              <ShareChip color={meta.color} label="Too accurate" onPress={() => handleShare('accurate')} />
              <ShareChip color={meta.color} label="Thought of you" onPress={() => handleShare('reminder')} />
            </Section>
          </View>
        </Animated.ScrollView>
      </Animated.View>

      {/* Close — fixed on screen, always reachable. */}
      <Animated.View style={[styles.closeWrap, { top: insets.top + 8, opacity: anim }]} pointerEvents="box-none">
        <TouchableOpacity onPress={close} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} activeOpacity={0.8}>
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
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
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={[styles.shareChip, { borderColor: solid ? `${color}77` : `${color}33` }]}>
      <Text style={[styles.shareChipText, solid && { color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  mediaWrap: { width: '100%', overflow: 'hidden' },
  mediaGilt: {
    position: 'absolute', top: 4, left: 4, right: 4, bottom: 0,
    borderWidth: 1, borderColor: 'rgba(212,175,110,0.22)', borderBottomWidth: 0,
  },
  sweep: { position: 'absolute', top: -MEDIA_H * 0.3, bottom: -MEDIA_H * 0.3, width: SCREEN_W * 0.5, left: 0 },
  grip: { position: 'absolute', alignSelf: 'center', width: 44, height: 4, borderRadius: 999, backgroundColor: 'rgba(241,217,164,0.5)', zIndex: 6 },
  closeWrap: { position: 'absolute', right: spacing.md, zIndex: 20 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8,7,12,0.6)', borderWidth: 1, borderColor: palette.giltSoft,
  },
  closeIcon: { color: palette.accentBright, fontSize: 15, fontWeight: '700', lineHeight: 18 },
  mediaPlate: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  plateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  areaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  areaChipIcon: { fontSize: 13 },
  areaChipText: { ...type.kicker, fontSize: 9, letterSpacing: 1.5 },
  orientBadge: { borderWidth: 1, borderColor: palette.gilt, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: 'rgba(8,7,12,0.55)' },
  orientBadgeRev: { borderColor: 'rgba(224,138,106,0.6)' },
  orientText: { ...type.kicker, fontSize: 9, color: palette.accent },
  orientTextRev: { color: palette.danger },
  cardName: { ...type.display, color: palette.text, fontSize: 32, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
  suitLine: { ...type.caption, color: palette.textSub, marginTop: 2, fontStyle: 'italic' },
  bodyWrap: {
    backgroundColor: palette.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    marginTop: -radius.lg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: palette.giltSoft,
    minHeight: SCREEN_H * 0.6,
  },
  bodyHandle: { alignSelf: 'center', width: 40, height: 3, borderRadius: 999, backgroundColor: palette.giltSoft, marginBottom: spacing.md },
  meaning: { ...type.body, fontStyle: 'italic', marginBottom: spacing.sm, lineHeight: 21 },
  teaser: { ...type.serifBody, color: palette.text, fontSize: 19, lineHeight: 29, marginBottom: spacing.md },
  keywordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: spacing.md },
  keywordChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 5 },
  keywordText: { ...type.caption, fontSize: 11, fontWeight: '600' },
  full: { ...type.body, color: palette.textSub, lineHeight: 25, marginBottom: spacing.md },
  punchBlock: { borderLeftWidth: 3, paddingLeft: spacing.md, paddingVertical: spacing.xs + 2, marginBottom: spacing.md },
  punch: { ...type.serifBody, color: palette.text, fontStyle: 'italic', fontSize: 18, lineHeight: 26 },
  timingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginBottom: spacing.md, paddingHorizontal: spacing.xs },
  timingIcon: { fontSize: 13, marginTop: 2 },
  timing: { ...type.caption, color: palette.textMuted, fontStyle: 'italic', flex: 1, lineHeight: 19 },
  actionBlock: { borderLeftWidth: 3, paddingLeft: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md, backgroundColor: 'rgba(255,255,255,0.025)', borderRadius: 6 },
  actionLabel: { ...type.kicker, fontSize: 9, color: palette.textMuted, marginBottom: 5 },
  actionText: { ...type.body, color: palette.textSub, lineHeight: 22 },
  deeperBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, backgroundColor: 'rgba(255,255,255,0.02)', gap: spacing.sm },
  deeperKicker: { ...type.kicker, fontSize: 9, marginBottom: 2 },
  deeperItem: { gap: 3 },
  deeperLabel: { ...type.kicker, color: palette.textMuted, fontSize: 8.5, letterSpacing: 1.4 },
  deeperText: { ...type.caption, color: palette.textSub, lineHeight: 19 },
  shareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.xs },
  shareChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  shareChipText: { ...type.caption, color: palette.textSub, fontSize: 12 },
});
