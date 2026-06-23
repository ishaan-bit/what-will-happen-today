/**
 * Pricing guardrail — asserts the two one-time products never get their
 * price/scope swapped:
 *   daily_unlock_v1  → ₹29 → today only (1 day)
 *   full_unlock_v1   → ₹49 → 30 days
 *
 * Run: npm run test:pricing   (also runs in the Android build workflow)
 */
import assert from 'node:assert/strict';
import {
  PRODUCT_DAILY,
  PRODUCT_FULL,
  PRODUCT_CATALOG,
  ALL_SKUS,
  fallbackPrice,
} from '../services/productCatalog.js';

// Ids are the canonical Play product ids.
assert.equal(PRODUCT_DAILY, 'daily_unlock_v1', 'daily product id changed');
assert.equal(PRODUCT_FULL, 'full_unlock_v1', 'full product id changed');
assert.notEqual(PRODUCT_DAILY, PRODUCT_FULL, 'the two products must be distinct');

// Daily = ₹29 = today only.
const daily = PRODUCT_CATALOG[PRODUCT_DAILY];
assert.equal(daily.fallbackPrice, '₹29', 'daily fallback price must be ₹29');
assert.equal(daily.scope, 'today', 'daily scope must be today');
assert.equal(daily.durationDays, 1, 'daily duration must be 1 day');

// Full = ₹49 = 30 days.
const full = PRODUCT_CATALOG[PRODUCT_FULL];
assert.equal(full.fallbackPrice, '₹49', 'full fallback price must be ₹49');
assert.equal(full.scope, 'thirtyDay', 'full scope must be thirtyDay');
assert.equal(full.durationDays, 30, 'full duration must be 30 days');

// The cheaper product must be the shorter one (catches an accidental swap).
assert.ok(daily.durationDays < full.durationDays, 'daily must be shorter than full');
assert.ok(
  Number(daily.fallbackPrice.replace(/[^\d]/g, '')) < Number(full.fallbackPrice.replace(/[^\d]/g, '')),
  'daily must be cheaper than full',
);

// fallbackPrice() resolves correctly and never crosses wires.
assert.equal(fallbackPrice(PRODUCT_DAILY), '₹29');
assert.equal(fallbackPrice(PRODUCT_FULL), '₹49');
assert.notEqual(fallbackPrice(PRODUCT_DAILY), fallbackPrice(PRODUCT_FULL));

// SKU list order: daily first, full second.
assert.deepEqual(ALL_SKUS, [PRODUCT_DAILY, PRODUCT_FULL], 'ALL_SKUS order changed');

console.log('✓ pricing guardrail: ₹29=daily(today), ₹49=full(30 days) — mapping intact');
