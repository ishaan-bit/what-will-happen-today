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
  HERO_POOL_LOADED: 'hero_pool_loaded',
  HERO_IMPRESSION: 'hero_impression',
  HERO_IMAGE_CHANGED: 'hero_image_changed',
  HERO_SHUFFLE_TAP: 'hero_shuffle_tap',
  HERO_SHUFFLE_AD_STARTED: 'hero_shuffle_ad_started',
  HERO_SHUFFLE_AD_COMPLETED: 'hero_shuffle_ad_completed',
  HERO_SHUFFLE_AD_FAILED: 'hero_shuffle_ad_failed',
  REWARDED_AD_REQUESTED: 'rewarded_ad_requested',
  REWARDED_AD_LOADED: 'rewarded_ad_loaded',
  REWARDED_AD_OPENED: 'rewarded_ad_opened',
  REWARDED_AD_EARNED: 'rewarded_ad_earned',
  REWARDED_AD_CLOSED: 'rewarded_ad_closed',
  REWARDED_AD_FAILED: 'rewarded_ad_failed',
  REWARD_GRANTED: 'reward_granted',
  REWARD_DENIED: 'reward_denied',

  // Free content funnel
  FIRST_SIGNAL_CTA_TAP: 'first_signal_cta_tap',
  FREE_SIGNAL_REVEALED: 'free_signal_revealed',
  FREE_CARD_IMPRESSION: 'free_card_impression',
  FREE_CARD_EXPAND: 'free_card_expand',
  FREE_CARD_COLLAPSE: 'free_card_collapse',

  // Content engagement
  LOCKED_SIGNAL_TAP: 'locked_signal_tap',
  LOCKED_SIGNAL_AD_STARTED: 'locked_signal_ad_started',
  LOCKED_SIGNAL_AD_COMPLETED: 'locked_signal_ad_completed',
  LOCKED_SIGNAL_AD_FAILED: 'locked_signal_ad_failed',
  DEEPER_MEANING_TAP: 'deeper_meaning_tap',
  DEEPER_MEANING_AD_STARTED: 'deeper_meaning_ad_started',
  DEEPER_MEANING_AD_COMPLETED: 'deeper_meaning_ad_completed',
  DEEPER_MEANING_AD_FAILED: 'deeper_meaning_ad_failed',
  LOCKED_CARD_TAP: 'locked_card_tap',
  READING_CATEGORY_VIEW: 'reading_category_view',
  ACTION_CTA_TAP: 'action_cta_tap',
  SHARE_CARD_TAP: 'share_card_tap',

  // Paywall funnel
  PAYWALL_VIEWED: 'paywall_viewed',
  PAYWALL_VIEW: 'paywall_viewed',
  PAYWALL_DISMISS: 'paywall_dismiss',
  PAYWALL_OPTION_SELECT: 'paywall_option_select',

  // Purchase funnel
  PURCHASE_TAP_29: 'purchase_tap_29',
  PURCHASE_SUCCESS_29: 'purchase_success_29',
  PURCHASE_FAILED_29: 'purchase_failed_29',
  PURCHASE_TAP_49: 'purchase_tap_49',
  PURCHASE_SUCCESS_49: 'purchase_success_49',
  PURCHASE_FAILED_49: 'purchase_failed_49',
  PURCHASE_START: 'purchase_start',
  PURCHASE_SUCCESS: 'purchase_success',
  PURCHASE_FAIL: 'purchase_fail',
  RESTORE_PURCHASE_TAP: 'restore_purchase_tap',
  ENTITLEMENT_ACTIVE: 'entitlement_active',
  ENTITLEMENT_EXPIRED: 'entitlement_expired',

  // Legacy aliases kept for billing service compatibility
  CATEGORY_TAP: 'category_tap',
  RESTORE_ATTEMPT: 'restore_attempt',

  // First-time onboarding
  FIRST_TIME_PREVIEW_DISMISS: 'first_time_preview_dismiss',
};
