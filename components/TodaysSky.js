/**
 * TodaysSky — the cinematic top module that frames the whole day.
 *
 * The ops "backup image" (image OR muted mp4) plays behind this panel as a
 * LIVING backdrop: a slow Ken-Burns drift + scroll parallax, an aurora sheen
 * that breathes across it, a gilt light sweep, drifting candlelit embers, and a
 * breathing planetary glyph ringed by a slow arcane circle. The planetary
 * statement, dominant energy, active window, watch-for and affected categories
 * layer over a gilt-framed legibility scrim.
 *
 * Everything is native-driver (transform + opacity only) and scales down on
 * weaker phones via deviceTier, so it stays smooth on every Android device.
 * On low-end devices the video backdrop is shown as its poster (no live decoder)
 * and the heaviest motion is dropped.
 */

import { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, spacing, radius, type, CATEGORY_META } from '@/utils/theme';
import { getDailyEnergy, getAffectedCategories } from '@/utils/cosmic';
import { HeroMedia } from '@/components/HeroMedia';
import { Embers } from '@/components/Embers';
import { fxCount, fxOn, motionLite } from '@/utils/deviceTier';

const SCREEN_W = Dimensions.get('window').width;
const PANEL_W = SCREEN_W - spacing.lg * 2;

export function TodaysSky({ vibe, moment, watchFor, backdrop, scrollParallax }) {
  const energy = getDailyEnergy();
  const affected = getAffectedCategories();
  const hasBackdrop = !!backdrop?.url;

  // One driver per continuous effect — all native, all looping.
  const drift = useRef(new Animated.Value(0)).current;   // gold glow breath
  const kb = useRef(new Animated.Value(0)).current;       // Ken Burns on backdrop
  const aurora = useRef(new Animated.Value(0)).current;   // aurora sheen sweep
  const sweep = useRef(new Animated.Value(0)).current;    // gilt light sweep
  const halo = useRef(new Animated.Value(0)).current;     // glyph halo breath
  const ring = useRef(new Animated.Value(0)).current;     // glyph arcane ring spin
  const enter = useRef(new Animated.Value(0)).current;    // chips entrance

  useEffect(() => {
    const loops = [];
    const loop = (val, dur, opts = {}) => {
      const l = Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: dur, easing: opts.in || Easing.inOut(Easing.sin), useNativeDriver: true }),
          ...(opts.hold ? [Animated.delay(opts.hold)] : []),
          opts.reset
            ? Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true })
            : Animated.timing(val, { toValue: 0, duration: dur, easing: opts.in || Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      l.start();
      loops.push(l);
    };

    loop(drift, 4600);
    loop(halo, 3200);
    if (!motionLite) {
      loop(kb, 11000);
      loop(aurora, 9000);
      loop(sweep, 1500, { in: Easing.inOut(Easing.quad), hold: 6500, reset: true });
      const r = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 42000, easing: Easing.linear, useNativeDriver: true }));
      r.start();
      loops.push(r);
    }
    Animated.timing(enter, { toValue: 1, duration: 800, delay: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();

    return () => loops.forEach((l) => l.stop());
  }, [drift, kb, aurora, sweep, halo, ring, enter]);

  const glowOpacity = drift.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.42] });
  const kbScale = kb.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1.14] });
  const kbX = kb.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] });
  // Scroll parallax: the backdrop drifts up slower than the content for depth.
  const parallaxY = scrollParallax
    ? scrollParallax.interpolate({ inputRange: [-120, 0, 320], outputRange: [22, 0, -46], extrapolate: 'clamp' })
    : 0;
  const auroraX = aurora.interpolate({ inputRange: [0, 1], outputRange: [-PANEL_W * 0.4, PANEL_W * 0.4] });
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-PANEL_W, PANEL_W * 1.2] });
  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.16] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });
  const glyphScale = halo.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.05] });
  const ringSpin = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const emberCount = fxCount(6);

  return (
    <View style={styles.wrap}>
      {/* Living backdrop (ops backup image / mp4) with Ken Burns + parallax */}
      {hasBackdrop ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { transform: [{ translateY: parallaxY }, { scale: kbScale }, { translateX: kbX }] }]}
        >
          <HeroMedia
            media={backdrop}
            style={StyleSheet.absoluteFill}
            audio="off"
            play={!motionLite}
            active={!motionLite}
            dim={0.5}
            fallbackColor={palette.ink}
          />
        </Animated.View>
      ) : null}

      {/* Aurora sheen drifting across the panel */}
      {fxOn() ? (
        <Animated.View pointerEvents="none" style={[styles.auroraWrap, { transform: [{ translateX: auroraX }] }]}>
          <LinearGradient
            colors={['transparent', 'rgba(191,160,238,0.16)', 'rgba(212,175,110,0.20)', 'rgba(116,210,171,0.12)', 'transparent']}
            start={{ x: 0, y: 0.2 }}
            end={{ x: 1, y: 0.8 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}

      {/* Drifting gold glow */}
      <Animated.View style={[styles.glowWrap, { opacity: glowOpacity }]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(212,175,110,0.26)', 'rgba(191,160,238,0.10)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Legibility scrim when a backdrop is present */}
      {hasBackdrop ? (
        <LinearGradient
          colors={['rgba(8,7,12,0.72)', 'rgba(8,7,12,0.5)', 'rgba(8,7,12,0.84)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}

      {/* Candlelit embers drifting inside the panel */}
      {fxOn() ? <Embers count={emberCount} width={PANEL_W} height={250} seed={11} /> : null}

      {/* Gilt light sweep */}
      {fxOn() ? (
        <Animated.View pointerEvents="none" style={[styles.sweep, { transform: [{ translateX: sweepX }, { rotate: '18deg' }] }]}>
          <LinearGradient
            colors={['transparent', 'rgba(241,217,164,0.22)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}

      <View style={[styles.container, hasBackdrop && styles.containerOnImage]}>
        {/* gilt inset frame */}
        <View pointerEvents="none" style={styles.giltInset} />

        <View style={styles.header}>
          <Text style={styles.kicker}>TODAY'S SKY</Text>
          <View style={styles.glyphWrap}>
            <Animated.View pointerEvents="none" style={[styles.glyphHalo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
            {fxOn() ? (
              <Animated.View pointerEvents="none" style={[styles.glyphRing, { transform: [{ rotate: ringSpin }] }]} />
            ) : null}
            <Animated.Text style={[styles.glyph, { transform: [{ scale: glyphScale }] }]}>{energy.glyph}</Animated.Text>
          </View>
        </View>

        <Text style={styles.energy}>{energy.text}</Text>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>Dominant energy</Text>
          <Text style={styles.value}>{vibe}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Most active window</Text>
          <Text style={styles.value}>{moment}</Text>
        </View>
        {watchFor ? (
          <View style={styles.watchRow}>
            <Text style={styles.label}>Watch for</Text>
            <Text style={styles.watchValue}>{watchFor}</Text>
          </View>
        ) : null}

        <View style={styles.divider} />

        <View style={styles.affectedRow}>
          <Text style={styles.affectedLabel}>This will touch</Text>
          <View style={styles.affectedChips}>
            {affected.map((cat, i) => {
              const meta = CATEGORY_META[cat];
              const chipStyle = {
                opacity: enter,
                transform: [
                  { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10 + i * 4, 0] }) },
                  { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
                ],
              };
              return (
                <Animated.View
                  key={cat}
                  style={[styles.affectedChip, { borderColor: `${meta.color}66`, backgroundColor: `${meta.color}1f` }, chipStyle]}
                >
                  <Text style={[styles.affectedChipGlyph, { color: meta.color }]}>{meta.icon}</Text>
                  <Text style={[styles.affectedChipText, { color: meta.color }]}>{meta.label}</Text>
                </Animated.View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.giltSoft,
    minHeight: 222,
    backgroundColor: palette.ink,
  },
  glowWrap: { ...StyleSheet.absoluteFillObject },
  auroraWrap: { ...StyleSheet.absoluteFillObject },
  sweep: { position: 'absolute', top: -70, bottom: -70, left: 0, width: PANEL_W * 0.38 },
  container: {
    backgroundColor: 'rgba(15,12,22,0.72)',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  containerOnImage: { backgroundColor: 'transparent' },
  giltInset: {
    position: 'absolute',
    top: 5, left: 5, right: 5, bottom: 5,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,110,0.16)',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  kicker: { ...type.kicker, color: palette.accentBright, letterSpacing: 3.5, fontSize: 10 },
  glyphWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  glyphHalo: { position: 'absolute', width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(212,175,110,0.5)' },
  glyphRing: { position: 'absolute', width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(241,217,164,0.45)' },
  glyph: { fontSize: 20, color: palette.accentBright, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  energy: { ...type.serifBody, color: palette.text, fontStyle: 'italic', fontSize: 19, lineHeight: 27, marginBottom: spacing.sm, textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 7 },
  divider: { height: 1, backgroundColor: 'rgba(212,175,110,0.16)', marginVertical: spacing.xs + 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 },
  label: { ...type.caption, color: palette.textMuted, fontSize: 12 },
  value: { ...type.caption, fontWeight: '600', color: palette.text, textAlign: 'right', flex: 1, marginLeft: spacing.md, fontSize: 12.5 },
  watchRow: { paddingVertical: 5 },
  watchValue: { ...type.caption, color: palette.accentBright, fontStyle: 'italic', marginTop: 3, fontSize: 12.5, lineHeight: 18 },
  affectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, gap: spacing.sm },
  affectedLabel: { ...type.caption, color: palette.textMuted, fontSize: 12 },
  affectedChips: { flexDirection: 'row', gap: 6 },
  affectedChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  affectedChipGlyph: { fontSize: 12 },
  affectedChipText: { ...type.kicker, fontSize: 10, letterSpacing: 1 },
});
