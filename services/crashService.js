import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function initCrashMonitoring() {
  // Sentry not compiled in; use backend reporting
}

export function captureError(error, context = {}) {
  console.error('[WWHT Error]', error?.message, context);
  reportToBackend(error, context).catch(() => null);
}

async function reportToBackend(error, context) {
  try {
    const apiUrl = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
    if (!apiUrl) return;

    await fetch(`${apiUrl}/api/crash-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error?.message || String(error),
        stack: error?.stack || null,
        componentStack: context?.errorInfo?.componentStack || null,
        appVersion: Constants.expoConfig?.version || null,
        platform: Platform.OS,
        screen: context?.screen || null,
      }),
    });
  } catch {
    // Reporter must never throw
  }
}
