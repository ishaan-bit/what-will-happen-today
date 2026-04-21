import { View, Text, StyleSheet } from 'react-native';
import { palette, spacing, type } from '@/utils/theme';
import { getTodayLabel } from '@/utils/dateUtils';

export function DayHeader() {
  const label = getTodayLabel();

  return (
    <View style={styles.container}>
      <Text style={styles.today}>Today</Text>
      <Text style={styles.date}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  today: {
    ...type.hero,
    color: palette.text,
    lineHeight: 44,
  },
  date: {
    ...type.caption,
    color: palette.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
});
