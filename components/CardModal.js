/**
 * CardModal — full-screen immersive takeover for one revealed card.
 *
 * The bound image/video fills the top ~half (mp4 plays with a tap-for-sound
 * control); the full reading scrolls beneath. Opened by tapping a face-up
 * TarotCard. Swipe down, tap the scrim, or ✕ to close.
 */

import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
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

const SCREEN_H = Dimensions.get('window').height;
const MEDIA_H = Math.round(SCREEN_H * 0.52);

function orientationLabel(o) { return o === 'reversed' ? 'Reversed' : 'Upright'; }

function suitLabel(tarot) {
  if (!tarot) return null;
  if (tarot.arcana === 'major') return 'Major Arcana';
  if (!tarot.suit) return null;
  return tarot.suit.charAt(0).toUpperCase() + tarot.suit.slice(1);
}

export function CardModal({ visible, card, onClose, deeperEnabled = true }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;   // 0 closed → 1 open
  const drag = useRef(new Animated.Value(0)).current;   // downward drag px

  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      Animated.spring(anim, { toValue: 1, tension: 60, friction: 11, useNativeDriver: true }).start();
    } else {
      anim.setValue(0);
    }
  }, [visible, anim, drag]);

  const close = () => {
    tap();
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onClose?.());
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => { if (g.dy > 0) drag.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 130 || g.vy > 1.2) {
          Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => onClose?.());
        } else {
          Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

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

  const contentTranslate = Animated.add(
    anim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H * 0.12, 0] }),
    drag,
  );

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={close}>
      <TouchableWithoutFeedback onPress={close}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
          <LinearGradient colors={gradients.modalWash} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: contentTranslate }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] },
        ]}
      >
        {/* ── Media ─────────────────────────────────────────── */}
        <View style={[styles.mediaWrap, { height: MEDIA_H, paddingTop: insets.top }]} {...panResponder.panHandlers}>
          <HeroMedia media={hero} style={StyleSheet.absoluteFill} audio="toggle" play fallbackColor="#0c0810" />
          <LinearGradient
            colors={['rgba(6,5,10,0.35)', 'rgba(6,5,10,0)', 'rgba(6,5,10,0.35)', 'rgba(8,7,12,0.98)']}
            locations={[0, 0.25, 0.6, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* gilt frame edge */}
          <View pointerEvents="none" style={styles.mediaGilt} />

          <View style={[styles.grip]} />
          <TouchableOpacity onPress={close} style={[styles.closeBtn, { top: insets.top + 8 }]} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} activeOpacity={0.8}>
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>

          <View style={styles.mediaPlate}>
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
          </View>
        </View>

        {/* ── Reading ───────────────────────────────────────── */}
        <View style={styles.bodyWrap}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
            {cardMeaning ? <Text style={[styles.meaning, { color: meta.color }]}>{cardMeaning}</Text> : null}
            <Text style={styles.teaser}>{prediction?.teaser}</Text>

            {keywords.length ? (
              <View style={styles.keywordRow}>
                {keywords.slice(0, 4).map((k) => (
                  <View key={k} style={[styles.keywordChip, { borderColor: `${meta.color}55` }]}>
                    <Text style={[styles.keywordText, { color: meta.color }]}>{k}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {prediction?.full ? <Text style={styles.full}>{prediction.full}</Text> : null}

            {prediction?.punch ? (
              <View style={[styles.punchBlock, { borderLeftColor: meta.color }]}>
                <Text style={styles.punch}>"{prediction.punch}"</Text>
              </View>
            ) : null}

            {prediction?.timing ? (
              <View style={styles.timingRow}>
                <Text style={[styles.timingIcon, { color: meta.color }]}>☽</Text>
                <Text style={styles.timing}>{prediction.timing}</Text>
              </View>
            ) : null}

            {prediction?.action ? (
              <View style={[styles.actionBlock, { borderLeftColor: meta.color }]}>
                <Text style={styles.actionLabel}>WHAT TO DO WHEN IT HAPPENS</Text>
                <Text style={styles.actionText}>{prediction.action}</Text>
              </View>
            ) : null}

            {deeperEnabled ? (
              <View style={[styles.deeperBox, { borderColor: `${meta.color}3a` }]}>
                <Text style={[styles.deeperKicker, { color: meta.color }]}>BENEATH THE CARD</Text>
                <DeeperItem label="Avoid" text={deeper.avoid} />
                <DeeperItem label="Say yes to" text={deeper.sayYesTo} />
                <DeeperItem label="Small move" text={deeper.move} />
              </View>
            ) : null}

            <View style={styles.shareRow}>
              <ShareChip color={meta.color} label="↗ Share" onPress={() => handleShare('default')} solid />
              <ShareChip color={meta.color} label="Too accurate" onPress={() => handleShare('accurate')} />
              <ShareChip color={meta.color} label="Thought of you" onPress={() => handleShare('reminder')} />
            </View>
          </ScrollView>
        </View>
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
  grip: { position: 'absolute', top: 8, alignSelf: 'center', width: 44, height: 4, borderRadius: 999, backgroundColor: 'rgba(241,217,164,0.5)', zIndex: 6 },
  closeBtn: {
    position: 'absolute', right: spacing.md, width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', zIndex: 7,
    backgroundColor: 'rgba(8,7,12,0.6)', borderWidth: 1, borderColor: palette.giltSoft,
  },
  closeIcon: { color: palette.accentBright, fontSize: 15, fontWeight: '700', lineHeight: 18 },
  mediaPlate: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.md },
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
  bodyWrap: { flex: 1, backgroundColor: palette.background, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
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
