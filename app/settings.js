/**
 * Settings — minimal: legal links, restore purchase, contact, version.
 */

import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import Constants from 'expo-constants';
import { ScreenShell } from '@/components/ScreenShell';
import { palette, spacing, radius, type } from '@/utils/theme';
import { useBilling } from '@/hooks/useBilling';
import { tap } from '@/utils/haptics';

const SUPPORT_EMAIL = 'qdenxp@gmail.com';
const COMPANY = 'QuietDen (OPC) Private Limited';

export default function SettingsScreen() {
  const { restore, restoring, billingReady } = useBilling();

  const version = Constants?.expoConfig?.version || '1.0.0';

  const handleRestore = useCallback(async () => {
    tap();
    if (!billingReady) {
      Alert.alert(
        'Payments unavailable',
        'In-app purchases are not active in this build. Install the latest version from Google Play.',
      );
      return;
    }
    const ok = await restore();
    Alert.alert(
      ok ? 'Purchase restored' : 'Nothing to restore',
      ok
        ? 'Your unlock has been re-applied.'
        : 'No previous purchases were found on this Google account.',
    );
  }, [restore, billingReady]);

  const handleEmail = useCallback(() => {
    tap();
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=What%20Will%20Happen%20Today%20support`);
  }, []);

  const Row = ({ label, value, onPress, dim }) => (
    <TouchableOpacity
      activeOpacity={onPress ? 0.7 : 1}
      onPress={() => {
        if (onPress) {
          tap();
          onPress();
        }
      }}
      style={styles.row}
    >
      <Text style={[styles.rowLabel, dim && { color: palette.textMuted }]}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : <Text style={styles.chev}>›</Text>}
    </TouchableOpacity>
  );

  return (
    <ScreenShell>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => { tap(); router.back(); }} style={styles.backBtn}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>PURCHASES</Text>
        <View style={styles.group}>
          <Row
            label={restoring ? 'Restoring…' : 'Restore purchase'}
            onPress={restoring ? null : handleRestore}
          />
        </View>

        <Text style={styles.sectionLabel}>LEGAL</Text>
        <View style={styles.group}>
          <Row label="Privacy policy" onPress={() => router.push('/legal/privacy')} />
          <Row label="Terms of service" onPress={() => router.push('/legal/terms')} />
        </View>

        <Text style={styles.sectionLabel}>SUPPORT</Text>
        <View style={styles.group}>
          <Row label="Email support" value={SUPPORT_EMAIL} onPress={handleEmail} />
        </View>

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.group}>
          <Row label="Version" value={version} dim />
          <Row label="Publisher" value={COMPANY} dim />
        </View>

        <Text style={styles.footer}>
          Made by {COMPANY}.{'\n'}Predictions are reflective, not medical or financial advice.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
  },
  back: {
    ...type.body,
    color: palette.textSub,
  },
  title: {
    ...type.hero,
    color: palette.text,
    marginTop: spacing.xs,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionLabel: {
    ...type.kicker,
    color: palette.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    letterSpacing: 2,
  },
  group: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.glassBorder,
  },
  rowLabel: {
    ...type.body,
    color: palette.text,
  },
  rowValue: {
    ...type.caption,
    color: palette.textSub,
  },
  chev: {
    color: palette.textMuted,
    fontSize: 22,
    fontWeight: '300',
  },
  footer: {
    ...type.caption,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 19,
  },
});
