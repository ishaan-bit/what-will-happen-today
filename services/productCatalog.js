/**
 * Product catalog — the SINGLE source of truth for the two one-time Google Play
 * products and their meaning. This exists to make it impossible to ever swap the
 * two prices/scopes by accident:
 *
 *   daily_unlock_v1  →  ₹29  →  unlocks ALL of TODAY's cards (today only)
 *   full_unlock_v1   →  ₹49  →  unlocks 30 days of full readings, ad-free
 *
 * Pure data, no React Native deps, so it is importable from the plain-node
 * test runner (tests/pricing.test.mjs) AND from the app via Metro.
 * billingService re-exports these ids so there is exactly one definition.
 */

export const PRODUCT_DAILY = 'daily_unlock_v1';
export const PRODUCT_FULL = 'full_unlock_v1';

export const PRODUCT_CATALOG = {
  [PRODUCT_DAILY]: {
    id: PRODUCT_DAILY,
    scope: 'today',          // resets at local midnight (date-keyed UNLOCK_TODAY)
    durationDays: 1,
    fallbackPrice: '₹29',    // used only until Google Play returns localizedPrice
    shortLabel: 'Unlock today',
    longLabel: "Today's full spread",
  },
  [PRODUCT_FULL]: {
    id: PRODUCT_FULL,
    scope: 'thirtyDay',      // 30 days from purchase (UNLOCK_ALL_MS)
    durationDays: 30,
    fallbackPrice: '₹49',
    shortLabel: '30 days',
    longLabel: '30 days of full readings',
  },
};

// Order matters for the Play products fetch; keep daily first, full second.
export const ALL_SKUS = [PRODUCT_DAILY, PRODUCT_FULL];

/** Fallback localized price (used only before Play returns the real price). */
export function fallbackPrice(productId) {
  return PRODUCT_CATALOG[productId]?.fallbackPrice ?? '';
}

/** Catalog entry for a product id, or null. */
export function productMeta(productId) {
  return PRODUCT_CATALOG[productId] || null;
}
