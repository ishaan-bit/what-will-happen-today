/**
 * deviceTier — a cheap, synchronous capability estimate so the immersive layer
 * (particles, parallax, Ken Burns, live video backdrops) can scale itself and
 * stay smooth on EVERY Android device, from a cheap Go phone to a flagship.
 *
 * We can't read RAM without a native module, so we proxy off:
 *   - Android API level (Platform.Version) — old OS ≈ old/slow hardware
 *   - screen area in dp and pixel density
 *
 * Tiers: 'low' (be gentle), 'mid' (default), 'high' (go all out).
 * Everything here is render-safe and never throws.
 */
import { Dimensions, PixelRatio, Platform } from 'react-native';

function compute() {
  let area = 360 * 760;
  let density = 2;
  try {
    const { width, height } = Dimensions.get('window');
    if (width && height) area = width * height;
    density = PixelRatio.get() || 2;
  } catch {}

  const androidApi = Platform.OS === 'android' ? Number(Platform.Version) || 0 : 999;

  // Android 8.0 (API 26) is our "modern enough" line; below it, go light.
  const isLow = (Platform.OS === 'android' && androidApi > 0 && androidApi < 26)
    || (density < 2 && area < 360 * 700);
  const isHigh = !isLow && area >= 380 * 800 && density >= 2.5;

  return { tier: isLow ? 'low' : isHigh ? 'high' : 'mid', area, density, androidApi };
}

const info = compute();

export const deviceTier = info.tier;
export const deviceInfo = info;

/** True on low-end devices — caller should drop the heaviest motion. */
export const motionLite = deviceTier === 'low';

/** Scale a particle/element count down on weaker devices. */
export function fxCount(base) {
  if (deviceTier === 'low') return Math.max(1, Math.round(base * 0.35));
  if (deviceTier === 'mid') return Math.round(base * 0.7);
  return base;
}

/**
 * Whether an optional effect should run.
 * fxOn()          → on for mid + high (off only on low)
 * fxOn('high')    → on for high only
 */
export function fxOn(level) {
  if (level === 'high') return deviceTier === 'high';
  return deviceTier !== 'low';
}
