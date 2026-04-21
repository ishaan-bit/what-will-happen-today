import { PostHog } from 'posthog-react-native';

let client;

export function initAnalytics() {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!apiKey || client) return client;

  client = new PostHog(apiKey, {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
  });

  return client;
}

export function track(event, properties = {}) {
  try {
    const instance = client || initAnalytics();
    if (!instance) return;
    instance.capture(event, properties);
  } catch {
    // Analytics must never crash the app
  }
}

// Semantic event helpers
export const Events = {
  APP_OPEN: 'app_open',
  CATEGORY_TAP: 'category_tap',
  PAYWALL_VIEW: 'paywall_view',
  PAYWALL_DISMISS: 'paywall_dismiss',
  PURCHASE_START: 'purchase_start',
  PURCHASE_SUCCESS: 'purchase_success',
  PURCHASE_FAIL: 'purchase_fail',
  RESTORE_ATTEMPT: 'restore_attempt',
};
