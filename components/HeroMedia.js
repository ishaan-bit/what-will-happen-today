/**
 * HeroMedia — one renderer for an uploaded image OR an mp4 (with audio).
 *
 * Used in three places so video/audio behaves consistently everywhere:
 *   - card art (face of a TarotCard)        → audio="off", active only when revealed
 *   - the Today's-Sky backdrop               → audio="off", dimmed, muted loop
 *   - the full-screen card takeover (modal)  → audio="toggle", tap-for-audio
 *
 * Images render as a covered <Image>. Videos autoplay muted+looping (Play
 * store / Android autoplay policy), showing the poster until the first frame
 * is ready; when audio="toggle" a small "Tap for sound" pill unmutes.
 *
 * `active` gates the native player ALLOCATION (not just playback): a face-down
 * card passes active={false} so it shows a poster/fallback and never spins up an
 * ExoPlayer decoder until it flips face-up.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Text, Animated } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { palette, radius } from '@/utils/theme';

function withVersion(source, version) {
  if (!source || typeof source !== 'string' || !version) return source;
  if (!/^https?:\/\//i.test(source)) return source;
  const [base, fragment] = source.split('#');
  const separator = base.includes('?') ? '&' : '?';
  const versioned = `${base}${separator}v=${encodeURIComponent(String(version))}`;
  return fragment ? `${versioned}#${fragment}` : versioned;
}

function VideoLayer({ source, posterUrl, audio, play, onError }) {
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const shimmer = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(
    source ? { uri: source, contentType: 'auto' } : null,
    (vp) => {
      vp.loop = true;
      vp.muted = true;
      vp.staysActiveInBackground = false;
      if (play) vp.play();
    },
  );

  useEffect(() => {
    setFirstFrameReady(false);
    setAudioOn(false);
  }, [source]);

  useEffect(() => {
    if (!player) return;
    try { player.muted = !audioOn; } catch {}
    try { play ? player.play() : player.pause(); } catch {}
  }, [player, audioOn, play]);

  useEffect(() => {
    const sub = player?.addListener?.('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && play) { try { player.play(); } catch {} }
      if (status === 'error') onError?.();
    });
    return () => sub?.remove?.();
  }, [player, play, onError]);

  // Subtle loading shimmer over the fallback color while we wait for the first
  // frame and there is no poster — so the wait reads as "loading", not a flash.
  useEffect(() => {
    if (firstFrameReady || posterUrl) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [firstFrameReady, posterUrl, shimmer]);

  return (
    <>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="cover"
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        useExoShutter={false}
        onFirstFrameRender={() => setFirstFrameReady(true)}
      />
      {posterUrl && !firstFrameReady ? (
        <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      {!posterUrl && !firstFrameReady ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.shimmer, { opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.22] }) }]}
        />
      ) : null}
      {audio === 'toggle' && !audioOn ? (
        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.audioBtn}
          onPress={() => setAudioOn(true)}
          accessibilityRole="button"
          accessibilityLabel="Play sound"
        >
          <Text style={styles.audioBtnText}>♪  Tap for sound</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

/**
 * @param media   { url, mediaType, posterUrl, version }
 * @param audio   'off' | 'toggle'  (default 'off')
 * @param play    whether video should be playing (default true)
 * @param active  whether to ALLOCATE the video decoder (default true). When
 *                false, a video shows its poster/fallback and no native player
 *                is created — keep face-down cards cheap.
 * @param dim     0..1 dark overlay opacity (default 0)
 */
export function HeroMedia({
  media,
  style,
  audio = 'off',
  play = true,
  active = true,
  dim = 0,
  fallbackColor = palette.surface,
  children,
}) {
  const [failed, setFailed] = useState(false);
  const url = media?.url || null;
  const isVideo = media?.mediaType === 'video';
  const version = media?.version || media?.revision || media?.updatedAt || null;

  const src = useMemo(() => withVersion(url, version), [url, version]);
  const poster = useMemo(() => withVersion(media?.posterUrl, version), [media?.posterUrl, version]);

  useEffect(() => { setFailed(false); }, [src, isVideo]);

  let inner = null;
  if (src && !failed) {
    if (isVideo) {
      inner = active
        ? <VideoLayer key={src} source={src} posterUrl={poster} audio={audio} play={play} onError={() => setFailed(true)} />
        : (poster ? <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null);
    } else {
      inner = <Image source={{ uri: src }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />;
    }
  }

  return (
    <View style={[styles.wrap, { backgroundColor: fallbackColor }, style]}>
      {inner}
      {dim > 0 ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(6,5,10,${dim})` }]} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  shimmer: { backgroundColor: palette.accent },
  audioBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(8,7,12,0.74)',
    borderWidth: 1,
    borderColor: palette.gilt,
  },
  audioBtnText: { color: palette.accentBright, fontSize: 12, fontWeight: '700' },
});
