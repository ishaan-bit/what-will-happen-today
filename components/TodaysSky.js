/**
 * TodaysSky
 *
 * The cinematic top module — frames the whole day. When the ops "backup image"
 * is set it plays behind this panel as a living backdrop (image OR muted mp4),
 * with the planetary statement, dominant energy, active window, watch-for and
 * affected categories layered over a gilt-framed scrim.
 */

import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, spacing, radius, type, CATEGORY_META } from '@/utils/theme';
import { getDailyEnergy, getAffectedCategories } from '@/utils/cosmic';
import { HeroMedia } from '@/components/HeroMedia';

export function TodaysSky({ vibe, moment, watchFor, backdrop }) {
  const energy = getDailyEnergy();
  const affected = getAffectedCategories();
  const driftAnim = useRef(new Animated.Value(0)).current;
  const hasBackdrop = !!backdrop?.url;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(driftAnim, { toValue: 1, duration: 4600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(driftAnim, { toValue: 0, duration: 4600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [driftAnim]);

  const glowOpacity = driftAnim.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.4] });

  return (
    <View style={styles.wrap}>
      {/* Living backdrop (the ops backup image / mp4) */}
      {hasBackdrop ? (
        <HeroMedia media={backdrop} style={StyleSheet.absoluteFill} audio="off" play dim={0.62} fallbackColor={palette.ink} />
      ) : null}

      {/* Drifting gold glow */}
      <Animated.View style={[styles.glowWrap, { opacity: glowOpacity }]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(212,175,110,0.24)', 'rgba(191,160,238,0.10)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Legibility scrim when a backdrop is present */}
      {hasBackdrop ? (
        <LinearGradient
          colors={['rgba(8,7,12,0.74)', 'rgba(8,7,12,0.58)', 'rgba(8,7,12,0.82)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}

      <View style={[styles.container, hasBackdrop && styles.containerOnImage]}>
        {/* gilt inset frame */}
        <View pointerEvents="none" style={styles.giltInset} />

        <View style={styles.header}>
          <Text style={styles.kicker}>TODAY'S SKY</Text>
          <Text style={styles.glyph}>{energy.glyph}</Text>
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
            {affected.map((cat) => {
              const meta = CATEGORY_META[cat];
              return (
                <View key={cat} style={[styles.affectedChip, { borderColor: `${meta.color}66`, backgroundColor: `${meta.color}1f` }]}>
                  <Text style={[styles.affectedChipGlyph, { color: meta.color }]}>{meta.icon}</Text>
                  <Text style={[styles.affectedChipText, { color: meta.color }]}>{meta.label}</Text>
                </View>
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
    minHeight: 200,
  },
  glowWrap: { ...StyleSheet.absoluteFillObject },
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
  glyph: { fontSize: 20, color: palette.accent },
  energy: { ...type.serifBody, color: palette.text, fontStyle: 'italic', fontSize: 19, lineHeight: 27, marginBottom: spacing.sm, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
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
