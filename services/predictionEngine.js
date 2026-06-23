import { love } from '@/content/love';
import { career } from '@/content/career';
import { money } from '@/content/money';
import { mood } from '@/content/mood';
import { getDailySeed, getTodayKey, seededRandom } from '@/utils/dateUtils';
import {
  getRecentIds,
  recordShownId,
  getCachedPredictions,
  cachePredictions,
  clearCachedPredictions,
  getInstallSalt,
  getLastRuleBucket,
  setLastRuleBucket,
  getLastEngineMode,
  setLastEngineMode,
  getCachedHeroAssignment,
  cacheHeroAssignment,
  clearCachedHeroAssignment,
} from '@/services/storageService';
import { mergeMonetizationConfig } from '@/services/monetizationConfig';
import { drawDailySpreadByCategory, tarotBlockFromDraw } from '@/utils/tarotDraw';
import { composePunch, composeDeeper, composeReading } from '@/utils/tarotReading';
import { getCardById, cardMeaning } from '@/content/tarotDeck';

const POOLS = { love, career, money, mood };

const CATEGORY_OFFSETS = {
  love: 0,
  career: 1000,
  money: 2000,
  mood: 3000,
};

const CATEGORIES = ['love', 'career', 'money', 'mood'];

function heroUrl(hero) {
  return hero?.videoUrl || hero?.mediaUrl || hero?.imageUrl || hero?.url || hero?.uri || hero?.src || null;
}

function normalizeHero(hero) {
  const url = heroUrl(hero);
  if (!hero || !url) return null;
  const mediaType = hero.mediaType === 'video' || hero.type === 'video' ? 'video' : 'image';
  return {
    ...hero,
    url,
    mediaUrl: url,
    mediaType,
    type: mediaType,
    ...(mediaType === 'image' ? { imageUrl: url } : {}),
    ...(mediaType === 'video' ? { videoUrl: url } : {}),
    cta: hero.cta || hero.CTA || hero.ctaCopy || null,
  };
}

function normalizeHeroPool(pool) {
  if (!pool?.images?.length) return null;
  const images = pool.images.map(normalizeHero).filter(Boolean);
  if (!images.length) return null;
  const defaultHeroId = pool.defaultHeroAssetId || pool.defaultHeroId || images.find((img) => img.isDefault)?.id || images[0].id || null;
  return {
    ...pool,
    images: images.map((img) => ({ ...img, isDefault: img.id === defaultHeroId || img.isDefault })),
    defaultHeroAssetId: defaultHeroId,
    defaultHeroId,
  };
}

function logHeroDebug(label, data) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[hero:${label}]`, data);
  }
}

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

async function pickForCategory(category, saltSeed) {
  const pool = POOLS[category];
  if (!pool || pool.length === 0) return null;

  const recentIds = await getRecentIds(category);
  const available = pool.filter((p) => !recentIds.includes(p.id));
  const source = available.length > 0 ? available : pool;

  const seed = (getDailySeed() + CATEGORY_OFFSETS[category] + saltSeed) >>> 0;
  const index = Math.floor(seededRandom(seed) * source.length);
  const prediction = source[index];

  await recordShownId(category, prediction.id);
  return { ...prediction, source: 'rule' };
}

export async function getTodaysPredictions(remoteRuleBucket = null, dateKey = getTodayKey()) {
  const [installSalt, lastBucket] = await Promise.all([
    getInstallSalt(),
    getLastRuleBucket(),
  ]);

  const bucket = remoteRuleBucket != null ? String(remoteRuleBucket) : lastBucket;
  // Fold the date into the salt so the rule "bucket" rotates DAILY on its own,
  // independent of the server bucket (which only changes on an ops re-pick) and
  // of getDailySeed. Result: picks are stable within a day, fresh every day,
  // varied per install and per ops bump. See [[monetization-model]] sibling note.
  const saltSeed = hashString(`${installSalt}|${bucket}|${dateKey}`);

  if (remoteRuleBucket != null && String(remoteRuleBucket) !== lastBucket) {
    await clearCachedPredictions();
    await setLastRuleBucket(remoteRuleBucket);
  }

  const cached = await getCachedPredictions();
  if (cached) return cached;

  const picks = await Promise.all(
    CATEGORIES.map((cat) => pickForCategory(cat, saltSeed))
  );
  const predictions = {};
  CATEGORIES.forEach((cat, i) => { predictions[cat] = picks[i]; });

  await cachePredictions(predictions);
  return predictions;
}

const REMOTE_TIMEOUT_MS = 4000;

export async function fetchRemotePayload() {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return null;
  try {
    // Send install id (anonymous hash) so backend can count distinct installs.
    let installId = '';
    try { installId = await getInstallSalt(); } catch {}
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
    const response = await fetch(`${apiUrl}/api/predictions/daily`, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...(installId ? { 'X-Install-Id': installId } : {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function getPredictions() {
  const remote = await fetchRemotePayload();
  const remoteHeroPool = normalizeHeroPool(remote?.heroPool);
  if (remoteHeroPool?.images?.length) {
    await cacheHeroAssignment(remoteHeroPool);
  } else if (remote) {
    await clearCachedHeroAssignment();
  }
  const cachedHeroPool = remoteHeroPool
    || (remote ? null : normalizeHeroPool(await getCachedHeroAssignment(remote?.heroBatchRevision)));
  const effectiveHeroImage = normalizeHero(cachedHeroPool?.images?.[0])
    || normalizeHero(remote?.heroImage)
    || null;
  // The Today's-Sky backdrop, kept separate from card art so it can play behind
  // the Today's Sky panel even when a full daily pool exists. Supports image OR
  // mp4 (with audio). Resolution order: the backend-resolved `backdropHero`
  // (ops backup image, else a spare pool image), then the legacy hero, then the
  // first cached pool image — so the backdrop ALWAYS renders when any media
  // exists, not only when a dedicated backup image was uploaded.
  const backupHero = normalizeHero(remote?.backdropHero)
    || normalizeHero(remote?.heroImage)
    || normalizeHero(cachedHeroPool?.images?.[0])
    || null;
  logHeroDebug('payload', {
    requestedDateKey: remote?.dateKey || getTodayKey(),
    heroSource: remoteHeroPool
      ? (remote?.heroPool?.source || 'batch')
      : (cachedHeroPool?.images?.length ? 'cached_batch' : (remote?.heroImage ? 'legacy' : 'none')),
    heroPoolCount: remoteHeroPool?.images?.length || 0,
    cachedHeroPoolCount: cachedHeroPool?.images?.length || 0,
    selectedHeroId: cachedHeroPool?.images?.[0]?.id || effectiveHeroImage?.id || null,
    selectedHeroImageUrlPrefix: heroUrl(cachedHeroPool?.images?.[0] || effectiveHeroImage)?.slice(0, 96) || null,
    selectedHeroTitle: cachedHeroPool?.images?.[0]?.title || effectiveHeroImage?.title || null,
    selectedHeroHeadline: cachedHeroPool?.images?.[0]?.headline || effectiveHeroImage?.headline || null,
    selectedHeroCTA: cachedHeroPool?.images?.[0]?.cta || effectiveHeroImage?.cta || null,
    fallbackUsed: !remoteHeroPool && !cachedHeroPool?.images?.length,
    fallbackReason: remote?.heroDiagnostics?.fallbackReason || (remote ? 'remote_without_batch' : 'remote_unavailable'),
  });
  const ruleBucket = remote?.ruleBucket ?? null;
  // Server-controlled mode: 'rule' means render rule-based picks only,
  // 'llm' means prefer LLM payload when present. Default to 'llm' if missing.
  const engineMode = remote?.engineMode === 'rule' ? 'rule' : 'llm';

  // If the engine mode has flipped since we last rendered, drop cached
  // predictions so the user sees the new source immediately.
  const lastMode = await getLastEngineMode();
  if (lastMode !== engineMode) {
    await clearCachedPredictions();
    await setLastEngineMode(engineMode);
  }

  const local = await getTodaysPredictions(ruleBucket, remote?.dateKey || getTodayKey());

  const [installSalt, lastBucket] = await Promise.all([
    getInstallSalt(),
    getLastRuleBucket(),
  ]);
  const bucket = ruleBucket != null ? String(ruleBucket) : lastBucket;
  const dateKey = remote?.dateKey || getTodayKey();

  // Deterministic tarot spread for the day — the shared substrate for BOTH
  // engines. Same draw is attached to rule picks and LLM picks so the cards
  // always read like a real tarot reading (online or offline).
  // Install-scoped daily spread — used by RULE / offline mode so each user sees
  // a personally varied card (stable per day, rotates daily).
  const spreadByCategory = drawDailySpreadByCategory({ installSalt, dateKey, bucket });

  // The per-day "house" spread the LLM actually wrote its reading against
  // (date-only, shared by every install — see backend/lib/tarot.js). In LLM
  // mode we display THIS card so the card name, its composed deeper meaning, and
  // the LLM prose all reference the SAME card. Falls back to the install-scoped
  // spread if the backend didn't send one (older backend / any missing card).
  const houseSpreadByCategory = (() => {
    const hs = remote?.houseSpread;
    if (!hs) return null;
    const out = {};
    for (const cat of CATEGORIES) {
      const entry = hs[cat];
      const card = entry && getCardById(entry.cardId);
      if (!card) return null;
      const orientation = entry.orientation === 'reversed' ? 'reversed' : 'upright';
      out[cat] = { category: cat, card, orientation, meaning: cardMeaning(card, orientation) };
    }
    return out;
  })();

  // Rule-based reading layer: every prediction is made faithful to its drawn
  // card. Picks that lack a `punch` (the static rule pools have none) get a
  // card-grounded one; the tarot block's `meaning.deeper` is composed from the
  // card; and an area with no content at all gets a complete composed reading.
  // Schema is unchanged. See docs/tarot-reading-guide.md + utils/tarotReading.js.
  const readingSeed = `${installSalt}|${bucket}|${dateKey}`;
  const attachTarot = (preds, spread = spreadByCategory) => {
    const out = {};
    for (const cat of CATEGORIES) {
      const draw = spread[cat];
      let pred = preds?.[cat];
      if (!pred) {
        pred = composeReading(draw, cat, readingSeed);
        if (!pred) { out[cat] = preds?.[cat]; continue; }
      }
      const withPunch = pred.punch ? pred : { ...pred, punch: composePunch(draw, cat, readingSeed) || pred.punch };
      out[cat] = withPunch.tarot
        ? withPunch
        : { ...withPunch, tarot: tarotBlockFromDraw(draw, composeDeeper(draw, cat, readingSeed)) };
    }
    return out;
  };

  // Rule mode: ignore LLM payload entirely, return rule picks (already
  // varied per-user via installSalt|bucket inside getTodaysPredictions).
  if (engineMode === 'rule') {
    return {
      predictions: attachTarot(local),
      heroImage: effectiveHeroImage,
      backupHero,
      heroPool: cachedHeroPool,
      monetizationConfig: mergeMonetizationConfig(remote?.monetizationConfig || {}, cachedHeroPool?.config || null),
      llmGeneratedAt: null,
      engineMode,
    };
  }

  const remoteData = remote?.data || null;
  const merged = {};
  for (const cat of CATEGORIES) {
    if (remoteData && remoteData[cat]) {
      // LLM payload may be a single object OR an array of variants.
      // Pick a deterministic variant per (install, bucket, date, category).
      const list = Array.isArray(remoteData[cat]) ? remoteData[cat] : [remoteData[cat]];
      const variant = list.length > 1
        ? list[hashString(`${installSalt}|${bucket}|${dateKey}|${cat}`) % list.length]
        : list[0];
      merged[cat] = { ...variant, source: 'llm', variantIndex: list.length > 1 ? list.indexOf(variant) : 0, variantCount: list.length };
    } else {
      merged[cat] = local[cat];
    }
  }

  return {
    // LLM mode: show the house card the LLM wrote against (coherent name + prose
    // + deeper). If the backend sent no house spread, fall back to install-scoped.
    predictions: attachTarot(merged, houseSpreadByCategory || spreadByCategory),
    heroImage: effectiveHeroImage,
    backupHero,
    heroPool: cachedHeroPool,
    monetizationConfig: mergeMonetizationConfig(remote?.monetizationConfig || {}, cachedHeroPool?.config || null),
    llmGeneratedAt: remote?.generatedAt || null,
    engineMode,
  };
}
