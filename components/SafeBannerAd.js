import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { spacing } from '@/utils/theme';

const bannerUnitId = process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID || '';

export function SafeBannerAd({ hidden = false }) {
  const [failed, setFailed] = useState(false);

  if (hidden || failed || !bannerUnitId) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <BannerAd
        unitId={bannerUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
