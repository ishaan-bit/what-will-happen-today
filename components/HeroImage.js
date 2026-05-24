/**
 * HeroImage — optional tarot-themed image at the top of the daily reading.
 * Renders nothing if no source provided.
 *
 * Positioning notes:
 *   - Sits between the day badge and the TodaysSky module.
 *   - Maintains a 4:5 aspect ratio with subtle gold border + radial glow
 *     so any uploaded artwork blends into the dark cosmic backdrop.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, radius, spacing } from '@/utils/theme';

const SCREEN_W = Dimensions.get('window').width;
// Slightly inset from the screen edges
const IMG_WIDTH = SCREEN_W - spacing.lg * 2;
const IMG_HEIGHT = Math.round(IMG_WIDTH * 1.25); // 4:5 portrait

function withVersion(source, version) {
  if (!source || typeof source !== 'string' || !version) return source;
  if (!/^https?:\/\//i.test(source)) return source;

  const [base, fragment] = source.split('#');
  const separator = base.includes('?') ? '&' : '?';
  const versioned = `${base}${separator}v=${encodeURIComponent(String(version))}`;
  return fragment ? `${versioned}#${fragment}` : versioned;
}

export function HeroImage({ source, version }) {
  const [failed, setFailed] = useState(false);
  const versionedSource = useMemo(() => withVersion(source, version), [source, version]);

  useEffect(() => {
    setFailed(false);
  }, [versionedSource]);

  if (!versionedSource || failed) return null;

  return (
    <View style={styles.wrap} accessible={false}>
      <View style={styles.frame}>
        <Image
          source={typeof versionedSource === 'string' ? { uri: versionedSource } : versionedSource}
          style={styles.image}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
        {/* Top + bottom gradient mask so the image blends into the dark UI */}
        <LinearGradient
          colors={['rgba(7,8,15,0.55)', 'rgba(7,8,15,0)', 'rgba(7,8,15,0.55)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>
      <LinearGradient
        colors={['rgba(201,169,110,0.18)', 'rgba(201,169,110,0)']}
        style={styles.glow}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  frame: {
    width: IMG_WIDTH,
    height: IMG_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.glassBorder,
    backgroundColor: '#0b0c14',
  },
  image: { width: '100%', height: '100%' },
  glow: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    height: 40,
    opacity: 0.6,
  },
});
