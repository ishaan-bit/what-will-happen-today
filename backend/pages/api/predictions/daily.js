/**
 * GET /api/predictions/daily
 *
 * Serves todays LLM-generated predictions to the mobile app PLUS
 * server-driven control values that influence the rule-based engine
 * (ruleBucket) and the optional hero image at the top of the UI.
 */

import { Redis } from '@upstash/redis';
import { mergeMonetizationConfig } from '@/lib/monetization';
import {
  assignDailyHeroSet,
  getServableHeroPool,
  heroPoolKey,
  LEGACY_HERO_KEY,
  legacyHeroAsPool,
  parseStoredJson,
} from '@/lib/heroPool';
import { drawHouseSpread } from '@/lib/tarot';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const redis = getRedis();
    const dateKey = getTodayKey();
    const isDebug = process.env.DEBUG_HERO_POOL === 'true';

    if (isDebug) console.log(`[/api/predictions/daily] START: dateKey=${dateKey}`);

    // Track unique installs (HyperLogLog — tiny memory, ~1% error)
    // Client sends X-Install-Id header (the installSalt). No PII.
    const installId = (req.headers['x-install-id'] || '').toString().slice(0, 64);
    if (installId) {
      try {
        await Promise.all([
          redis.pfadd('wwht:installs:total', installId),
          redis.pfadd(`wwht:installs:dau:${dateKey}`, installId),
          // Keep DAU keys for ~8 days then auto-expire
          redis.expire(`wwht:installs:dau:${dateKey}`, 8 * 24 * 60 * 60),
        ]);
      } catch {
        // Non-critical
      }
    }

    const legacyHeroKey = LEGACY_HERO_KEY;
    const heroPoolRedisKey = heroPoolKey(dateKey);

    if (isDebug) console.log(`[/api/predictions/daily] Redis keys:`, {
      legacy: legacyHeroKey,
      pool: heroPoolRedisKey,
    });

    const [raw, ruleBucket, heroRaw, heroPoolRaw, engineModeRaw, monetizationRaw] = await Promise.all([
      redis.get(`wwht:predictions:${dateKey}`),
      redis.get('wwht:ruleBucket'),
      redis.get(legacyHeroKey),
      redis.get(heroPoolRedisKey),
      redis.get('wwht:engineMode'),
      redis.get('wwht:monetizationConfig'),
    ]);

    if (isDebug) {
      console.log(`[/api/predictions/daily] Redis fetch results:`, {
        hasPredictions: !!raw,
        hasBucket: !!ruleBucket,
        hasLegacyHero: !!heroRaw,
        hasHeroPool: !!heroPoolRaw,
      });
    }

    let data = null;
    let generatedAt = null;
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      data = parsed.predictions || null;
      generatedAt = parsed.generatedAt || null;
    }

    const rawStoredHeroPool = parseStoredJson(heroPoolRaw);
    const rawBatchCount = Array.isArray(rawStoredHeroPool?.images) ? rawStoredHeroPool.images.length : 0;
    const storedHeroPool = getServableHeroPool(rawStoredHeroPool);
    const legacyHeroPool = getServableHeroPool(legacyHeroAsPool(parseStoredJson(heroRaw), dateKey), { allowData: true });
    const monetizationConfig = mergeMonetizationConfig(
      parseStoredJson(monetizationRaw),
      storedHeroPool?.config || null,
    );

    if (isDebug) {
      console.log(`[/api/predictions/daily] Pool status:`, {
        storedPoolImages: storedHeroPool?.images?.length || 0,
        legacyPoolImages: legacyHeroPool?.images?.length || 0,
        storedPoolNull: storedHeroPool === null,
        legacyPoolNull: legacyHeroPool === null,
      });
    }

    // WWHT 2.0: exactly 4 cards, one image each. Pad from the legacy hero when
    // fewer than 4 batch images are servable; the client repeats images if the
    // assigned set is still short, so a card always has art.
    const TARGET_CARD_COUNT = 4;
    const assignedBatchHeroPool = storedHeroPool ? assignDailyHeroSet(storedHeroPool, {
      installId,
      dateKey,
      count: TARGET_CARD_COUNT,
      fallbackHero: legacyHeroPool,
    }) : null;
    const heroSource = assignedBatchHeroPool ? 'batch' : (legacyHeroPool ? 'legacy' : 'none');
    const fallbackReason = assignedBatchHeroPool
      ? null
      : (rawBatchCount > 0 ? 'no_servable_batch_items' : 'no_batch_pool');
    const heroPool = assignedBatchHeroPool
      ? { ...assignedBatchHeroPool, source: 'batch' }
      : (legacyHeroPool ? { ...legacyHeroPool, source: 'legacy' } : null);

    if (isDebug) {
      console.log(`[/api/predictions/daily] FINAL HERO DECISION:`, {
        hasAssignedPool: !!assignedBatchHeroPool,
        usedLegacyFallback: heroSource === 'legacy',
        heroPoolImages: heroPool?.images?.length || 0,
        heroSource,
        fallbackReason,
      });
    }

    // Backcompat: existing production app builds read only `heroImage`.
    // Keep that field tied to the legacy one-hero system. New builds read
    // the additive `heroPool` field for daily batch/assignment.
    const heroImage = legacyHeroPool?.images?.[0] || null;

    // Today's-Sky backdrop. The Today's Sky panel plays a living image/video
    // behind it. Prefer the dedicated ops "backup image" (wwht:heroImage); if
    // none is set, fall back to a daily-pool image that is NOT already bound to
    // one of the 4 cards (only possible when the ops pool has >4 images), and
    // finally to the pool default — so the backdrop ALWAYS renders whenever any
    // media exists, not only when a separate backup image was uploaded.
    const assignedCardIds = new Set((assignedBatchHeroPool?.images || []).map((img) => img.id));
    const servablePoolImages = storedHeroPool?.images || [];
    const spareBackdrop = servablePoolImages.find((img) => !assignedCardIds.has(img.id)) || null;
    const backdropHero = heroImage || spareBackdrop || servablePoolImages[0] || null;
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

    // The deterministic per-day house spread the LLM reads (date-seeded, shared
    // by every install). Sent so the app can show the SAME card the LLM wrote
    // for in LLM mode — keeping card name, deeper meaning, and prose in agreement.
    // Rule / offline mode uses its own install-scoped draw instead.
    let houseSpread = null;
    try {
      const sp = drawHouseSpread(dateKey);
      houseSpread = Object.fromEntries(
        Object.entries(sp).map(([cat, d]) => [cat, { cardId: d.card.id, orientation: d.orientation }])
      );
    } catch (_) {
      houseSpread = null;
    }

    // Engine mode controls which source the client renders.
    //   'llm'  -> show LLM payload when present (fallback to rule per-category)
    //   'rule' -> show rule-based picks only, ignore LLM payload entirely
    // Defaults to 'llm' for backwards compatibility.
    const engineMode = engineModeRaw === 'rule' ? 'rule' : 'llm';

    if (isDebug) console.log(`[/api/predictions/daily] RESPONSE:`, {
      heroImagePresent: !!heroImage,
      heroPoolPresent: !!heroPool,
      heroPoolImageCount: heroPool?.images?.length || 0,
    });

    const heroDiagnostics = (process.env.NODE_ENV === 'development' || isDebug) ? {
      dateKey,
      rawBatchCount,
      servableBatchCount: storedHeroPool?.images?.length || 0,
      heroSource,
      fallbackReason,
    } : undefined;

    return res.status(200).json({
      data,
      dateKey,
      generatedAt,
      readingUpdatedAt: generatedAt,
      contentRevision: generatedAt || dateKey,
      ruleBucket: ruleBucket ? String(ruleBucket) : '0',
      engineMode,
      heroSource,
      heroFallbackReason: fallbackReason,
      heroImage,
      backdropHero,
      houseSpread,
      heroPool,
      assignedHeroes: heroPool?.images || [],
      heroBatchRevision: assignedBatchHeroPool?.revision || storedHeroPool?.revision || null,
      monetizationConfig,
      heroImageUpdatedAt: heroImage?.updatedAt || null,
      heroImageRevision: heroImage?.revision || heroImage?.updatedAt || null,
      ...(heroDiagnostics ? { heroDiagnostics } : {}),
    });
  } catch (err) {
    console.error('[/api/predictions/daily]', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
