import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { palette, spacing, type } from '@/utils/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Screen not found</Text>
      <Link href="/" asChild>
        <TouchableOpacity style={styles.link}>
          <Text style={styles.linkText}>Go home</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: { ...type.title, color: palette.text, marginBottom: spacing.lg },
  link: { padding: spacing.sm },
  linkText: { ...type.body, color: palette.accent, textDecorationLine: 'underline' },
});
