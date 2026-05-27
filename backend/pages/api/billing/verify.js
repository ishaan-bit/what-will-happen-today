/**
 * POST /api/billing/verify
 * Public endpoint — mobile app posts a Play purchase token here right after
 * `purchaseUpdatedListener` fires. We verify with Google Play Developer API
 * via the linked service account and reply with whether the entitlement
 * should be granted.
 *
 * Body: { productId: 'daily_unlock_v1' | 'full_unlock_v1', purchaseToken: string, installId?: string }
 * Response: { ok: true, valid: boolean, productId, orderId?, purchaseState }
 *
 * On verification-infrastructure failures we still return 200 with
 * `valid: false, reason: 'verify_unavailable'` so the client can decide
 * whether to grant a grace unlock (we currently grant locally as a
 * fallback to avoid blocking paying users while keys propagate).
 */
import { Redis } from '@upstash/redis';
import { verifyConsumablePurchase, isVerificationConfigured } from '../../../lib/playVerify.js';
import { recordVerifiedEntitlement } from '../../../lib/entitlements.js';

const ALLOWED_PRODUCTS = new Set(['daily_unlock_v1', 'full_unlock_v1']);

let _redis = null;
function getRedis() {
  if (!_redis && process.env.UPSTASH_REDIS_REST_URL) _redis = Redis.fromEnv();
  return _redis;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const body = req.body || {};
  const productId = String(body.productId || '').trim();
  const purchaseToken = String(body.purchaseToken || '').trim();
  const installId = String(body.installId || '').trim().slice(0, 64);

  if (!ALLOWED_PRODUCTS.has(productId)) {
    return res.status(400).json({ ok: false, error: 'invalid_product' });
  }
  if (!purchaseToken) {
    return res.status(400).json({ ok: false, error: 'missing_token' });
  }

  if (!isVerificationConfigured()) {
    return res.status(200).json({ ok: true, valid: false, reason: 'verify_unavailable', productId });
  }

  try {
    const result = await verifyConsumablePurchase({ productId, purchaseToken });

    let entitlement = null;

    // Best-effort audit + anonymous entitlement log (non-blocking).
    try {
      const redis = getRedis();
      if (redis) {
        const entry = JSON.stringify({
          ts: new Date().toISOString(),
          productId,
          orderId: result.orderId || null,
          purchaseState: result.purchaseState,
          installId: installId || null,
        });
        await redis.lpush('wwht:purchases', entry);
        await redis.ltrim('wwht:purchases', 0, 499);
        if (result.valid && installId) {
          entitlement = await recordVerifiedEntitlement(redis, {
            installId,
            productId,
            orderId: result.orderId || null,
          });
        }
      }
    } catch {
      /* audit failures must never block the user */
    }

    return res.status(200).json({
      ok: true,
      valid: result.valid,
      productId,
      orderId: result.orderId || null,
      purchaseState: result.purchaseState,
      entitlement,
    });
  } catch (err) {
    const message = err?.message || 'verify_failed';
    // Any Google API error -> tell client verification is unavailable; client
    // grants a local grace unlock so the paying user is not stuck.
    return res.status(200).json({
      ok: true,
      valid: false,
      reason: 'verify_error',
      message,
      productId,
    });
  }
}
