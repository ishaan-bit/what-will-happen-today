/**
 * VibeBar
 *
 * Displays today's vibe, most likely moment, and optional watch-for hint
 * at the top of the home screen. All values are deterministic per day.
 */

import { View, Text, StyleSheet } from 'react-native';
import { palette, spacing, radius, type } from '@/utils/theme';
import { getDailyEnergy } from '@/utils/cosmic';

export function VibeBar({ vibe, moment, watchFor }) {
  const energy = getDailyEnergy();
  return (
    <View style={styles.container}>
      {/* Cosmic energy banner */}
      <View style={styles.energyRow}>
        <Text style={styles.energyGlyph}>{energy.glyph}</Text>
        <Text style={styles.energyText}>{energy.text}</Text>
      </View>

      <View style={styles.separator} />

      {/* Row 1: vibe */}
      <View style={styles.row}>
        <Text style={styles.label}>Today's vibe</Text>
        <Text style={styles.value}>{vibe}</Text>
      </View>

      <View style={styles.separator} />

      {/* Row 2: most likely moment */}
      <View style={styles.row}>
        <Text style={styles.label}>Most likely moment</Text>
        <Text style={styles.value}>{moment}</Text>
      </View>

      {/* Row 3: watch for (optional) */}
      {watchFor ? (
        <>
          <View style={styles.separator} />
          <View style={styles.watchRow}>
            <Text style={styles.watchLabel}>Watch for</Text>
            <Text style={styles.watchValue}>{watchFor}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  separator: {
    height: 1,
    backgroundColor: palette.glassBorder,
    marginVertical: 1,
  },
  label: {
    ...type.caption,
    color: palette.textMuted,
  },
  value: {
    ...type.caption,
    fontWeight: '600',
    color: palette.textSub,
    textAlign: 'right',
    flex: 1,
    marginLeft: spacing.md,
  },
  watchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 5,
    gap: spacing.sm,
  },
  watchLabel: {
    ...type.caption,
    color: palette.textMuted,
    flexShrink: 0,
  },
  watchValue: {
    ...type.caption,
    color: palette.accent,
    fontStyle: 'italic',
    flex: 1,
    textAlign: 'right',
  },
  energyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: spacing.sm,
  },
  energyGlyph: {
    fontSize: 16,
    color: palette.accent,
  },
  energyText: {
    ...type.caption,
    color: palette.accent,
    fontStyle: 'italic',
    flex: 1,
    letterSpacing: 0.3,
  },
});
