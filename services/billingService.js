/**
 * Billing Service – Google Play one-time purchases (consumables)
 *
 * Products:
 *   daily_unlock_v1   ₹29 – unlocks all categories for today only
 *   full_unlock_v1    ₹49 – unlocks 30 days of full readings (stored locally)
 *
 * Uses react-native-iap with retry logic adapted from TriggerMap pattern.
 */

import {
  endConnection,
  finishTransaction,
  getAvailablePurchases,
  getProducts,
  initConnection,
  requestPurchase,
  purchaseErrorListener,
  purchaseUpdatedListener,
} from 'react-native-iap';
import { setUnlockToday, setUnlockAll, getInstallSalt } from '@/services/storageService';

export const PRODUCT_DAILY = 'daily_unlock_v1';
export const PRODUCT_FULL = 'full_unlock_v1';
export const ALL_SKUS = [PRODUCT_DAILY, PRODUCT_FULL];

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;
const VERIFY_TIMEOUT_MS = 6000;

/**
 * Verify a Play purchase with our backend (which calls Google Play
 * Developer API via the linked service account). Returns true if the
 * backend confirms the purchase OR if verification is unavailable —
 * we never block a paying user because of a server hiccup.
 */
async function verifyWithBackend({ productId, purchaseToken }) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return true; // no backend configured – trust client
  try {
    let installId = '';
    try { installId = await getInstallSalt(); } catch {}
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    const response = await fetch(`${apiUrl}/api/billing/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, purchaseToken, installId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return true; // server error – fall back to grant
    const data = await response.json().catch(() => null);
    if (!data) return true;
    // Explicit "valid: false" with a real verify result -> reject.
    // Anything else (verify_unavailable / verify_error) -> grant grace unlock.
    if (data.valid === false && !data.reason) return false;
    return true;
  } catch {
    return true;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let purchaseUpdateSub = null;
let purchaseErrorSub = null;

/**
 * Initialise IAP connection and attach purchase listeners.
 * Call once at app startup (inside provider).
 * @param {Function} onPurchaseComplete – called with { productId } on success
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function initBilling(onPurchaseComplete) {
  try {
    await initConnection();

    purchaseUpdateSub = purchaseUpdatedListener(async (purchase) => {
      const { productId, purchaseToken, purchaseStateAndroid } = purchase;
      if (!purchaseToken) return;
      // Android pending purchases are not entitlements yet. Wait for Play to
      // send a purchased update before finishing or granting access.
      if (Number(purchaseStateAndroid) === 2) return;

      try {
        // Server-side receipt validation against Google Play Developer API.
        // verifyWithBackend grants on infra failure so paying users are never blocked.
        const verified = await verifyWithBackend({ productId, purchaseToken });
        if (!verified) {
          console.warn('[Billing] backend rejected purchase', productId);
          // Do NOT finishTransaction — leave it pending so Google retries / refunds.
          return;
        }

        await finishTransaction({ purchase, isConsumable: true });

        if (productId === PRODUCT_DAILY) {
          await setUnlockToday();
        } else if (productId === PRODUCT_FULL) {
          await setUnlockAll();
        }

        if (onPurchaseComplete) {
          onPurchaseComplete({ productId });
        }
      } catch (err) {
        console.warn('[Billing] finishTransaction error:', err.message);
      }
    });

    purchaseErrorSub = purchaseErrorListener((error) => {
      if (error.code !== 'E_USER_CANCELLED') {
        console.warn('[Billing] purchaseError:', error.code, error.message);
      }
    });
    return { ok: true };
  } catch (err) {
    const reason = err?.message || 'unknown';
    console.warn('[Billing] initConnection error:', reason);
    return { ok: false, reason };
  }
}

/** Tear down listeners – call on unmount of billing provider. */
export function teardownBilling() {
  purchaseUpdateSub?.remove();
  purchaseErrorSub?.remove();
  endConnection().catch(() => null);
}

/**
 * Fetches product info from Play Store with retry logic.
 * Returns array of product objects or empty array on failure.
 */
export async function fetchProducts() {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const products = await getProducts({ skus: ALL_SKUS });
      return products ?? [];
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }
  console.warn('[Billing] fetchProducts failed after retries:', lastError?.message);
  return [];
}

/**
 * Initiates a purchase flow for the given productId.
 * Throws with a user-facing message on failure.
 */
export async function purchaseProduct(productId) {
  if (!ALL_SKUS.includes(productId)) {
    throw new Error('Unknown product');
  }

  try {
    await requestPurchase({ skus: [productId] });
    // Actual unlock is handled by purchaseUpdatedListener
  } catch (err) {
    if (err.code === 'E_USER_CANCELLED') {
      throw new Error('Purchase cancelled');
    }
    if (err.code === 'E_ITEM_UNAVAILABLE' || err.code === 'E_SKU_NOT_FOUND') {
      throw new Error('This unlock is not yet available on Google Play. We are turning it on shortly.');
    }
    if (err.code === 'E_NOT_PREPARED' || err.code === 'E_IAP_NOT_AVAILABLE') {
      throw new Error('In-app purchases are not available in this build. Please install from Google Play.');
    }
    if (err.code === 'E_NETWORK_ERROR') {
      throw new Error('Network issue. Check your connection and try again.');
    }
    console.warn('[Billing] requestPurchase error:', err.code, err.message);
    throw new Error(err?.message || 'Purchase failed. Please try again.');
  }
}

/**
 * Restores any prior purchases (e.g. after reinstall for full_unlock_v1
 * stored as consumable — not applicable for truly consumed products,
 * but useful for ownership check during development / testing).
 * Returns boolean: whether any unlock was restored.
 */
export async function restorePurchases() {
  try {
    const purchases = await getAvailablePurchases();
    let restored = false;

    for (const purchase of purchases) {
      if (purchase.productId === PRODUCT_FULL) {
        await setUnlockAll();
        restored = true;
      }
      if (purchase.productId === PRODUCT_DAILY) {
        await setUnlockToday();
        restored = true;
      }
    }

    return restored;
  } catch (err) {
    console.warn('[Billing] restorePurchases error:', err.message);
    return false;
  }
}
