/**
 * Push notification service.
 *
 * Asks for permission, fetches the Expo push token, and sends it to the
 * backend so the daily-push cron can target this device. Best-effort and
 * silent on failure — the app must work without notifications.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

let _registered = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('daily', {
      name: 'Daily reading',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#c9a96e',
    });
  } catch {
    // Non-critical
  }
}

export async function registerForPushNotificationsAsync() {
  if (_registered) return null;
  _registered = true;

  try {
    await ensureAndroidChannel();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;

    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResult?.data;
    if (!token) return null;

    await sendTokenToBackend(token);
    return token;
  } catch (err) {
    if (__DEV__) console.warn('[push] register failed:', err.message);
    _registered = false; // allow retry next launch
    return null;
  }
}

async function sendTokenToBackend(token) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    await fetch(`${apiUrl}/api/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        platform: Platform.OS,
        appVersion: Constants?.expoConfig?.version || '',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch {
    // Non-critical
  }
}
