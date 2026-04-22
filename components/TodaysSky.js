/**
 * TodaysSky
 *
 * The top module — frames everything below as derived from today's "sky".
 * Slow drifting glow + planetary statement + dominant energy + active window
 * + watch for + which categories it affects.
 */

import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, spacing, radius, type, CATEGORY_META } from '@/utils/theme';
import { getDailyEnergy, getAffectedCategories } from '@/utils/cosmic';

export function TodaysSky({ vibe, moment, watchFor }) {
  const energy = getDailyEnergy();
  const affected = getAffectedCategories();
  const driftAnim = useRef(new Animated.Value(0)).current;

  // Slow drifting glow opacity
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(driftAnim, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(driftAnim, {
          toValue: 0,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [driftAnim]);

  const glowOpacity = driftAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.42],
  });

  return (
    <View style={styles.wrap}>
      {/* Drifting glow background */}
      <Animated.View style={[styles.glowWrap, { opacity: glowOpacity }]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(201,169,110,0.22)', 'rgba(184,156,247,0.10)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View style={styles.container}>
        {/* Header — TODAY'S SKY */}
        <View style={styles.header}>
          <Text style={styles.kicker}>TODAY'S SKY</Text>
          <Text style={styles.glyph}>{energy.glyph}</Text>
        </View>

        {/* Planetary statement — the lead */}
        <Text style={styles.energy}>{energy.text}</Text>

        <View style={styles.divider} />

        {/* Three rows: dominant energy / active window / watch for */}
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

        {/* Affected categories */}
        <View style={styles.affectedRow}>
          <Text style={styles.affectedLabel}>This will touch</Text>
          <View style={styles.affectedChips}>
            {affected.map((cat) => {
              const meta = CATEGORY_META[cat];
              return (
                <View
                  key={cat}
                  style={[styles.affectedChip, { borderColor: `${meta.color}66`, backgroundColor: `${meta.color}14` }]}
                >
                  <Text style={[styles.affectedChipGlyph, { color: meta.color }]}>{meta.icon}</Text>
                  <Text style={[styles.affectedChipText, { color: meta.color }]}>
                    {meta.label}
                  </Text>
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
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  glowWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.md,
  },
  container: {
    backgroundColor: 'rgba(13,17,32,0.78)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.22)',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kicker: {
    ...type.kicker,
    color: palette.accent,
    letterSpacing: 3,
    fontSize: 10,
  },
  glyph: {
    fontSize: 18,
    color: palette.accent,
  },
  energy: {
    ...type.bodyMed,
    color: palette.text,
    fontStyle: 'italic',
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  label: {
    ...type.caption,
    color: palette.textMuted,
    fontSize: 12,
  },
  value: {
    ...type.caption,
    fontWeight: '600',
    color: palette.textSub,
    textAlign: 'right',
    flex: 1,
    marginLeft: spacing.md,
    fontSize: 12,
  },
  watchRow: {
    paddingVertical: 5,
  },
  watchValue: {
    ...type.caption,
    color: palette.accent,
    fontStyle: 'italic',
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
  },
  affectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    gap: spacing.sm,
  },
  affectedLabel: {
    ...type.caption,
    color: palette.textMuted,
    fontSize: 12,
  },
  affectedChips: {
    flexDirection: 'row',
    gap: 6,
  },
  affectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  affectedChipGlyph: {
    fontSize: 12,
  },
  affectedChipText: {
    ...type.kicker,
    fontSize: 10,
    letterSpacing: 1,
  },
});
