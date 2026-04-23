/**
 * Settings - push toggle, restore purchase, legal links, version.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  Switch,
} from 'react-native';
import { Stack, router } from 'expo-router';
import Constants from 'expo-constants';
import { ScreenShell } from '@/components/ScreenShell';
import { palette, spacing, radius, type } from '@/utils/theme';
import { useBilling } from '@/hooks/useBilling';
import { tap } from '@/utils/haptics';
import {
  getPushEnabled,
  setPushEnabled,
  getUnlockAllInfo,
  getUnlockToday,
} from '@/services/storageService';
import {
  registerForPushNotificationsAsync,
  unregisterPushToken,
} from '@/services/pushService';

const SUPPORT_EMAIL = 'qdenxp@gmail.com';
const COMPANY = 'QuietDen (OPC) Private Limited';

export default function SettingsScreen() {
  const { restore, restoring, billingReady } = useBilling();
  const [pushOn, setPushOn] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [unlockInfo, setUnlockInfo] = useState({ active: false, daysRemaining: 0 });
  const [dailyActive, setDailyActive] = useState(false);

  const version = Constants?.expoConfig?.version || '1.0.0';

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [push, info, today] = await Promise.all([
        getPushEnabled(),
        getUnlockAllInfo(),
        getUnlockToday(),
      ]);
      if (!mounted) return;
      setPushOn(push);
      setUnlockInfo(info);
      setDailyActive(today);
    })();
    return () => { mounted = false; };
  }, []);

  const handleTogglePush = useCallback(async (next) => {
    if (pushBusy) return;
    tap();
    setPushBusy(true);
    setPushOn(next);
    try {
      await setPushEnabled(next);
      if (next) {
        await registerForPushNotificationsAsync();
      } else {
        await unregisterPushToken();
      }
    } catch (err) {
      setPushOn(!next);
      Alert.alert('Could not update', err?.message || 'Try again.');
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy]);

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
    if (ok) {
      const info = await getUnlockAllInfo();
      setUnlockInfo(info);
    }
  }, [restore, billingReady]);

  const handleEmail = useCallback(() => {
    tap();
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=What%20Will%20Happen%20Today%20support`);
  }, []);

  const handleTestPush = useCallback(async () => {
    tap();
    try {
      const r = await registerForPushNotificationsAsync(true);
      if (r?.ok) {
        Alert.alert('Push registered', `Token saved on backend.\nReason: ${r.reason}`);
      } else {
        Alert.alert(
          'Push not registered',
          `Reason: ${r?.reason || 'unknown'}${r?.error ? `\nError: ${r.error}` : ''}`,
        );
      }
    } catch (err) {
      Alert.alert('Push test failed', err?.message || 'Unknown error');
    }
  }, []);

  const Row = ({ label, value, onPress, dim, right }) => (
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
      {right
        ? right
        : value
          ? <Text style={styles.rowValue}>{value}</Text>
          : <Text style={styles.chev}>{onPress ? '\u203A' : ''}</Text>}
    </TouchableOpacity>
  );

  let unlockStatusText;
  if (unlockInfo.active) {
    unlockStatusText = `Active \u00B7 ${unlockInfo.daysRemaining} day${unlockInfo.daysRemaining === 1 ? '' : 's'} left`;
  } else if (dailyActive) {
    unlockStatusText = "Today's unlock active";
  } else {
    unlockStatusText = 'Not active';
  }

  return (
    <ScreenShell>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => { tap(); router.back(); }} style={styles.backBtn}>
          <Text style={styles.back}>{'\u2039 Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.group}>
          <Row
            label="Daily reminder"
            right={
              <Switch
                value={pushOn}
                onValueChange={handleTogglePush}
                disabled={pushBusy}
                trackColor={{ false: '#2a2a35', true: palette.accent }}
                thumbColor="#f5f5f5"
              />
            }
          />
          <Row label="Test push registration" onPress={handleTestPush} />
        </View>

        <Text style={styles.sectionLabel}>UNLOCK</Text>
        <View style={styles.group}>
          <Row label="30-day full unlock" value={unlockStatusText} dim />
          <Row
            label={restoring ? 'Restoring\u2026' : 'Restore purchase'}
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
    minHeight: 52,
  },
  rowLabel: {
    ...type.body,
    color: palette.text,
    flex: 1,
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
