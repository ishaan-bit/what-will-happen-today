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
} from '@/services/storageService';

const POOLS = { love, career, money, mood };

const CATEGORY_OFFSETS = {
  love: 0,
  career: 1000,
  money: 2000,
  mood: 3000,
};

const CATEGORIES = ['love', 'career', 'money', 'mood'];

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

export async function getTodaysPredictions(remoteRuleBucket = null) {
  const [installSalt, lastBucket] = await Promise.all([
    getInstallSalt(),
    getLastRuleBucket(),
  ]);

  const bucket = remoteRuleBucket != null ? String(remoteRuleBucket) : lastBucket;
  const saltSeed = hashString(`${installSalt}|${bucket}`);

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

  const local = await getTodaysPredictions(ruleBucket);

  const [installSalt, lastBucket] = await Promise.all([
    getInstallSalt(),
    getLastRuleBucket(),
  ]);
  const bucket = ruleBucket != null ? String(ruleBucket) : lastBucket;
  const dateKey = remote?.dateKey || getTodayKey();

  // Rule mode: ignore LLM payload entirely, return rule picks (already
  // varied per-user via installSalt|bucket inside getTodaysPredictions).
  if (engineMode === 'rule') {
    return {
      predictions: local,
      heroImage: remote?.heroImage || null,
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
    predictions: merged,
    heroImage: remote?.heroImage || null,
    llmGeneratedAt: remote?.generatedAt || null,
    engineMode,
  };
}