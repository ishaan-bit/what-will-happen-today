/**
 * Push notification service.
 *
 * Asks for permission, fetches the Expo push token, and sends it to the
 * backend so the daily-push cron can target this device.
 *
 * Every step posts a short trace to /api/push/debug so we can diagnose
 * silent failures from the ops console without needing device logs.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { getPushEnabled, getInstallSalt } from '@/services/storageService';

let _registered = false;
let _lastToken = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function debugLog(step, ok, info = '') {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return;
  try {
    let installId = '';
    try { installId = await getInstallSalt(); } catch {}
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch(`${apiUrl}/api/push/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step, ok,
        info: String(info || '').slice(0, 240),
        installId,
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

/**
 * Try to register. Returns { ok, token, reason } so the Settings UI can show
 * the user exactly what happened. Also posts a trace to backend.
 *
 * If `force` is true, ignores in-memory _registered guard (used by Settings
 * "Retry registration" button).
 */
export async function registerForPushNotificationsAsync(force = false) {
  if (_registered && !force) {
    return { ok: !!_lastToken, token: _lastToken, reason: _lastToken ? 'cached' : 'already_attempted' };
  }
  _registered = true;

  await debugLog('start', true, `force=${force}`);

  const allowed = await getPushEnabled();
  if (!allowed) {
    _registered = false;
    await debugLog('toggle_off', false, 'user disabled in settings');
    return { ok: false, token: null, reason: 'toggle_off' };
  }

  try {
    await ensureAndroidChannel();
    await debugLog('channel', true);

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      _registered = false;
      await debugLog('permission', false, `status=${finalStatus}`);
      return { ok: false, token: null, reason: `permission_${finalStatus}` };
    }
    await debugLog('permission', true, finalStatus);

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;
    if (!projectId) {
      _registered = false;
      await debugLog('project_id', false, 'missing');
      return { ok: false, token: null, reason: 'no_project_id' };
    }
    await debugLog('project_id', true, projectId);

    let tokenResult;
    try {
      tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    } catch (err) {
      _registered = false;
      await debugLog('get_token', false, err?.message || String(err));
      return { ok: false, token: null, reason: 'get_token_failed', error: err?.message };
    }
    const token = tokenResult?.data;
    if (!token) {
      _registered = false;
      await debugLog('get_token', false, 'empty token result');
      return { ok: false, token: null, reason: 'empty_token' };
    }
    await debugLog('get_token', true, token.slice(0, 24) + '…');

    _lastToken = token;
    const sent = await sendTokenToBackend(token);
    if (!sent.ok) {
      _registered = false;
      await debugLog('register_post', false, sent.error || 'unknown');
      return { ok: false, token, reason: 'backend_register_failed', error: sent.error };
    }
    await debugLog('register_post', true, 'token saved on backend');
    return { ok: true, token, reason: 'registered' };
  } catch (err) {
    _registered = false;
    await debugLog('exception', false, err?.message || String(err));
    return { ok: false, token: null, reason: 'exception', error: err?.message };
  }
}

/** Tell backend to forget this device's token. Best-effort. */
export async function unregisterPushToken() {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl && _lastToken) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      await fetch(`${apiUrl}/api/push/unregister`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: _lastToken }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch {
      // Non-critical
    }
  }
  _registered = false;
  _lastToken = null;
}

async function sendTokenToBackend(token) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return { ok: false, error: 'no_api_url' };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${apiUrl}/api/push/register`, {
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
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'network' };
  }
}

export { _lastToken };
