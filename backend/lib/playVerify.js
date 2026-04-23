/**
 * Google Play purchase verification.
 *
 * Both WWHT products (`daily_unlock_v1`, `full_unlock_v1`) are one-time
 * consumables, so we hit `androidpublisher.purchases.products.get` rather
 * than the subscriptions endpoint.
 *
 * Required env (Vercel):
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  – full JSON of the service-account key
 *   GOOGLE_PLAY_PACKAGE_NAME          – com.wwht.app
 *
 * The service account must be linked in Play Console
 *   (Setup → API access → grant "View financial data, orders, and cancellation
 *   survey responses" + "Manage orders and subscriptions").
 */
import { google } from 'googleapis';

let _cachedAuth = null;

function getAuth() {
  if (_cachedAuth) return _cachedAuth;
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing');
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (e) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  _cachedAuth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  return _cachedAuth;
}

export function isVerificationConfigured() {
  return !!(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_PLAY_PACKAGE_NAME);
}

/**
 * Verify a one-time product purchase.
 * @param {{ productId: string, purchaseToken: string }} args
 * @returns {Promise<{ valid: boolean, purchaseState: number, acknowledgementState: number, orderId?: string, raw: any }>}
 */
export async function verifyConsumablePurchase({ productId, purchaseToken }) {
  if (!isVerificationConfigured()) {
    throw new Error('Play verification not configured');
  }
  const auth = getAuth();
  const androidpublisher = google.androidpublisher({ version: 'v3', auth });
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;

  const { data } = await androidpublisher.purchases.products.get({
    packageName,
    productId,
    token: purchaseToken,
  });

  // purchaseState: 0 = purchased, 1 = canceled, 2 = pending
  const purchaseState = Number(data.purchaseState ?? 0);
  const acknowledgementState = Number(data.acknowledgementState ?? 0);
  return {
    valid: purchaseState === 0,
    purchaseState,
    acknowledgementState,
    orderId: data.orderId,
    raw: data,
  };
}
