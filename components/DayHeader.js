import { View, Text, StyleSheet } from 'react-native';
import { palette, spacing, type } from '@/utils/theme';
import { getTodayLabel } from '@/utils/dateUtils';
import { getDailyHookLine } from '@/utils/freeCategory';

export function DayHeader({ unlocked = false }) {
  const label = getTodayLabel();
  const hookLine = getDailyHookLine();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.today}>Today</Text>
        {unlocked && (
          <Text style={styles.unlockedBadge}>✦ All signals unlocked</Text>
        )}
      </View>
      <Text style={styles.date}>{label}</Text>
      <Text style={styles.hookLine}>{hookLine}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  today: {
    ...type.hero,
    color: palette.text,
    lineHeight: 44,
  },
  unlockedBadge: {
    ...type.kicker,
    color: palette.accent,
  },
  date: {
    ...type.caption,
    color: palette.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  hookLine: {
    ...type.body,
    color: palette.textSub,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
});
