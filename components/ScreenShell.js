import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette, spacing } from '@/utils/theme';

export function ScreenShell({ children, style }) {
  return (
    <SafeAreaView style={[styles.safe, style]} edges={['top']}>
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.background,
  },
  inner: {
    flex: 1,
  },
});
