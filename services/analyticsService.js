import { PostHog } from 'posthog-react-native';
import { getTodayKey } from '@/utils/dateUtils';

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
    // Attach today's date to every event for funnel analysis
    instance.capture(event, { date: getTodayKey(), source_app: 'wwht', ...properties });
  } catch {
    // Analytics must never crash the app
  }
}

export const Events = {
  // Session lifecycle
  APP_OPEN: 'app_open',
  DAILY_SCREEN_VIEW: 'daily_screen_view',

  // Free content funnel
  FREE_CARD_IMPRESSION: 'free_card_impression',
  FREE_CARD_EXPAND: 'free_card_expand',
  FREE_CARD_COLLAPSE: 'free_card_collapse',

  // Content engagement
  LOCKED_CARD_TAP: 'locked_card_tap',
  READING_CATEGORY_VIEW: 'reading_category_view',
  ACTION_CTA_TAP: 'action_cta_tap',
  SHARE_CARD_TAP: 'share_card_tap',

  // Paywall funnel
  PAYWALL_VIEW: 'paywall_view',
  PAYWALL_DISMISS: 'paywall_dismiss',
  PAYWALL_OPTION_SELECT: 'paywall_option_select',

  // Purchase funnel
  PURCHASE_START: 'purchase_start',
  PURCHASE_SUCCESS: 'purchase_success',
  PURCHASE_FAIL: 'purchase_fail',
  RESTORE_PURCHASE_TAP: 'restore_purchase_tap',

  // Legacy aliases kept for billing service compatibility
  CATEGORY_TAP: 'category_tap',
  RESTORE_ATTEMPT: 'restore_attempt',
};
