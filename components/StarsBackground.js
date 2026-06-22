/**
 * StarsBackground
 *
 * Deterministic star field + two slow drifting nebula orbs and a gentle
 * twinkle on the brightest stars. Native-driven (opacity/transform only), so
 * it stays cheap even behind the scrolling spread.
 */

import { useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette } from '@/utils/theme';

const STAR_COUNT = 46;

function rand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function StarsBackground() {
  const stars = useMemo(() => {
    const list = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const bright = rand(i * 19.3) > 0.78;
      const size = rand(i * 7.13) < 0.85 ? 1.5 : 2.5;
      const opacity = 0.16 + rand(i * 11.7) * 0.4;
      list.push({
        key: i,
        top: `${rand(i * 3.1) * 100}%`,
        left: `${rand(i * 5.7) * 100}%`,
        size: bright ? size + 0.5 : size,
        opacity,
        gold: bright,
        twinkle: rand(i * 23.9) > 0.6,
      });
    }
    return list;
  }, []);

  const twinkle = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const shootA = useRef(new Animated.Value(0)).current;
  const shootB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const d = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    // Occasional shooting stars: a quick streak, then a long quiet wait.
    const shoot = (val, lead, gap) => Animated.loop(
      Animated.sequence([
        Animated.delay(lead),
        Animated.timing(val, { toValue: 1, duration: 1050, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(gap),
      ])
    );
    const sa = shoot(shootA, 3200, 11000);
    const sb = shoot(shootB, 12500, 15000);
    t.start();
    d.start();
    sa.start();
    sb.start();
    return () => { t.stop(); d.stop(); sa.stop(); sb.stop(); };
  }, [twinkle, drift, shootA, shootB]);

  const twinkleOpacity = twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const orbAY = drift.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] });
  const orbBY = drift.interpolate({ inputRange: [0, 1], outputRange: [16, -16] });

  const shootStyle = (val) => ({
    opacity: val.interpolate({ inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 0.9, 0.9, 0] }),
    transform: [
      { translateX: val.interpolate({ inputRange: [0, 1], outputRange: [0, 230] }) },
      { translateY: val.interpolate({ inputRange: [0, 1], outputRange: [0, 150] }) },
      { rotate: '33deg' },
    ],
  });

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Drifting nebula orbs */}
      <Animated.View style={[styles.orb, styles.orbA, { transform: [{ translateY: orbAY }] }]}>
        <LinearGradient
          colors={['rgba(201,169,110,0.16)', 'rgba(201,169,110,0)']}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[styles.orb, styles.orbB, { transform: [{ translateY: orbBY }] }]}>
        <LinearGradient
          colors={['rgba(184,156,247,0.13)', 'rgba(184,156,247,0)']}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {stars.map((s) => {
        const base = {
          position: 'absolute',
          top: s.top,
          left: s.left,
          width: s.size,
          height: s.size,
          borderRadius: s.size / 2,
          backgroundColor: s.gold ? palette.accent : '#cfd8e8',
        };
        if (s.twinkle) {
          return <Animated.View key={s.key} style={[base, { opacity: twinkleOpacity }]} />;
        }
        return <View key={s.key} style={[base, { opacity: s.opacity }]} />;
      })}

      {/* Shooting stars — rare, quick gold streaks across the upper sky */}
      <Animated.View style={[styles.shootWrap, { top: '11%', left: '6%' }, shootStyle(shootA)]}>
        <LinearGradient
          colors={['rgba(241,217,164,0)', 'rgba(241,217,164,0.9)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.shootTail}
        />
        <View style={styles.shootHead} />
      </Animated.View>
      <Animated.View style={[styles.shootWrap, { top: '5%', left: '34%' }, shootStyle(shootB)]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.shootTail}
        />
        <View style={styles.shootHead} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    overflow: 'hidden',
  },
  orbA: {
    width: 320,
    height: 320,
    top: 40,
    left: -90,
  },
  orbB: {
    width: 280,
    height: 280,
    top: 360,
    right: -80,
    left: undefined,
  },
  shootWrap: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
  shootTail: {
    width: 78,
    height: 1.6,
    borderRadius: 1,
  },
  shootHead: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginLeft: -1,
    backgroundColor: '#fff',
    shadowColor: '#f1d9a4',
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
