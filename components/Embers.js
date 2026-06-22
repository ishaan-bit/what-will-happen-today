/**
 * Embers — slow candlelit gold motes that rise and fade, with a gentle sway.
 *
 * Pure ambiance for the occult-deck feel. Every mote is a UI-thread reanimated
 * loop (opacity + transform only), so a field of them stays cheap even behind
 * the scrolling spread or over the card-modal media.
 *
 *   <Embers />                              full-screen, behind the content
 *   <Embers count={8} height={MEDIA_H} />   constrained to a media header
 *
 * pointerEvents is always "none" — embers never intercept touches.
 */

import { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withDelay,
  withTiming,
  cancelAnimation,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { palette } from '@/utils/theme';

const SCREEN = Dimensions.get('window');

// Deterministic pseudo-random so a given index always yields the same mote.
function rand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function Ember({ i, fieldW, fieldH, seed }) {
  const p = useSharedValue(0);

  const cfg = useMemo(() => {
    const s = (i + 1) * 1.37 + seed;
    const size = 2 + rand(s * 7.7) * 3.4;
    return {
      size,
      startX: rand(s * 3.3) * fieldW,
      baseY: fieldH * (0.72 + rand(s * 2.2) * 0.34),  // start low (can be off-bottom)
      rise: fieldH * (0.55 + rand(s * 5.1) * 0.45),   // how far it climbs
      sway: 12 + rand(s * 6.6) * 26,
      phase: rand(s * 8.1),
      maxOpacity: 0.22 + rand(s * 1.7) * 0.4,
      duration: 8500 + rand(s * 9.9) * 9000,
      delay: rand(s * 4.4) * 9000,
      gold: rand(s * 12.3) > 0.35,                    // most gold, a few cool-white
    };
  }, [i, fieldW, fieldH, seed]);

  useEffect(() => {
    p.value = withDelay(
      cfg.delay,
      withRepeat(withTiming(1, { duration: cfg.duration, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(p);
  }, [p, cfg]);

  const style = useAnimatedStyle(() => {
    const y = cfg.baseY - p.value * cfg.rise;
    const x = cfg.startX + Math.sin((p.value + cfg.phase) * Math.PI * 2) * cfg.sway;
    const opacity = interpolate(p.value, [0, 0.12, 0.78, 1], [0, cfg.maxOpacity, cfg.maxOpacity, 0]);
    return { opacity, transform: [{ translateX: x }, { translateY: y }] };
  });

  const core = cfg.gold ? palette.accentBright : '#dce6f5';
  const halo = cfg.gold ? 'rgba(241,217,164,0.5)' : 'rgba(180,200,235,0.45)';

  return (
    <Animated.View style={[styles.mote, style]}>
      <View style={{
        position: 'absolute',
        width: cfg.size * 4.5, height: cfg.size * 4.5, borderRadius: cfg.size * 2.25,
        left: -cfg.size * 2.25, top: -cfg.size * 2.25,
        backgroundColor: halo, opacity: 0.4,
      }} />
      <View style={{
        position: 'absolute',
        width: cfg.size, height: cfg.size, borderRadius: cfg.size / 2,
        left: -cfg.size / 2, top: -cfg.size / 2,
        backgroundColor: core,
      }} />
    </Animated.View>
  );
}

export function Embers({ count = 14, width = SCREEN.width, height = SCREEN.height, seed = 0, style }) {
  const list = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  return (
    <View pointerEvents="none" style={[styles.container, style]}>
      {list.map((i) => (
        <Ember key={i} i={i} fieldW={width} fieldH={height} seed={seed} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  mote: { position: 'absolute', top: 0, left: 0 },
});
