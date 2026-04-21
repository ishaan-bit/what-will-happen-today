/**
 * SkeletonCard – shown while predictions load.
 * Uses simple animated opacity to suggest content shape.
 */

import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { palette, spacing, radius } from '@/utils/theme';

function Bone({ width, height, style }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.bone,
        { width, height: height || 14, opacity, borderRadius: (height || 14) / 2 },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Bone width={60} height={10} style={{ marginBottom: spacing.md }} />
      <Bone width="90%" height={14} style={{ marginBottom: 8 }} />
      <Bone width="70%" height={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    padding: spacing.md,
  },
  bone: {
    backgroundColor: palette.elevated,
  },
});
