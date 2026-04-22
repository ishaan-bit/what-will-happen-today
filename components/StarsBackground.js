/**
 * StarsBackground
 *
 * Static, deterministic field of dim stars behind the home screen.
 * Pure Views — no images, no animation loops. ~40 dots, near-zero cost.
 */

import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { palette } from '@/utils/theme';

const STAR_COUNT = 40;

function rand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function StarsBackground() {
  const stars = useMemo(() => {
    const list = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const size = rand(i * 7.13) < 0.85 ? 1.5 : 2.5;
      const opacity = 0.18 + rand(i * 11.7) * 0.42;
      list.push({
        key: i,
        top: `${rand(i * 3.1) * 100}%`,
        left: `${rand(i * 5.7) * 100}%`,
        size,
        opacity,
        gold: rand(i * 19.3) > 0.82,
      });
    }
    return list;
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {stars.map((s) => (
        <View
          key={s.key}
          style={[
            styles.star,
            {
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              borderRadius: s.size / 2,
              opacity: s.opacity,
              backgroundColor: s.gold ? palette.accent : '#cfd8e8',
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  star: {
    position: 'absolute',
  },
});
