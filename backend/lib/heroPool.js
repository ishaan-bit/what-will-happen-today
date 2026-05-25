import { DEFAULT_MONETIZATION_CONFIG, normalizeMonetizationConfig } from './monetization.js';

export const HERO_POOL_PREFIX = 'wwht:heroPool:';
export const LEGACY_HERO_KEY = 'wwht:heroImage';

export function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

export function hashToUint(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function normalizeDateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return getTodayKey();
  const compact = raw.replace(/-/g, '');
  if (/^\d{8}$/.test(compact)) return compact;
  return getTodayKey();
}

export function heroPoolKey(dateKey) {
  return `${HERO_POOL_PREFIX}${normalizeDateKey(dateKey)}`;
}

function hashString(str) {
  return hashToUint(str).toString(36);
}

function cleanText(value, fallback = '', max = 160) {
  return String(value || fallback).trim().slice(0, max);
}

function cleanTags(tags) {
  const list = Array.isArray(tags)
    ? tags
    : String(tags || '')
      .split(',')
      .map((t) => t.trim());
  return [...new Set(list
    .map((t) => String(t || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 16))];
}

function isPublicImageUrl(url) {
  return /^https?:\/\/.+/i.test(String(url || '').trim());
}

function isLegacyHeroUrl(url) {
  return isPublicImageUrl(url) || /^data:image\//i.test(String(url || '').trim());
}

export function normalizeHeroImage(input = {}, index = 0, dateKey = getTodayKey(), { allowData = false } = {}) {
  const url = cleanText(input.url, '', allowData ? 4_000_000 : 2000);
  if (!(allowData ? isLegacyHeroUrl(url) : isPublicImageUrl(url))) return null;

  const id = cleanText(input.id, `hero_${dateKey}_${index + 1}_${hashString(url).slice(0, 6)}`, 80)
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  const weight = Math.max(0, Math.min(1000, parseInt(input.weight, 10) || 1));
  const title = cleanText(input.title || input.name, `Hero ${index + 1}`, 100);
  const readerMood = cleanText(input.readerMood, 'The Mirror', 80);

  return {
    id,
    url,
    title,
    name: title,
    active: input.active !== false && input.enabled !== false,
    enabled: input.active !== false && input.enabled !== false,
    storeSafe: input.storeSafe !== false,
    dateKey,
    campaign: cleanText(input.campaign || input.assignment, '', 80),
    tags: cleanTags(input.tags),
    readerMood,
    headline: cleanText(input.headline, `${readerMood} is waiting`, 140),
    cta: cleanText(input.cta || input.ctaCopy, 'Let her draw your first signal', 120),
    weight,
    priority: weight,
    isDefault: input.isDefault === true || input.default === true,
    alt: cleanText(input.alt, title, 120),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

export function normalizeHeroPool(input = {}, previous = null) {
  const dateKey = normalizeDateKey(input.dateKey || input.date || previous?.dateKey);
  const images = (Array.isArray(input.images) ? input.images : [])
    .map((item, index) => normalizeHeroImage(item, index, dateKey))
    .filter(Boolean);

  const defaultIndex = images.findIndex((img) => img.isDefault);
  if (defaultIndex < 0 && images.length > 0) images[0].isDefault = true;
  if (defaultIndex >= 0) {
    images.forEach((img, index) => { img.isDefault = index === defaultIndex; });
  }

  const config = normalizeMonetizationConfig({
    maxHeroShufflesPerDay: input.maxHeroShufflesPerDay ?? input.config?.maxHeroShufflesPerDay ?? previous?.config?.maxHeroShufflesPerDay ?? DEFAULT_MONETIZATION_CONFIG.maxHeroShufflesPerDay,
    maxHeroImagesPerDay: input.maxHeroImagesPerDay ?? input.config?.maxHeroImagesPerDay ?? previous?.config?.maxHeroImagesPerDay ?? DEFAULT_MONETIZATION_CONFIG.maxHeroImagesPerDay,
  });

  const revision = Number(previous?.revision || 0) + 1;
  return {
    dateKey,
    assignment: cleanText(input.assignment || input.campaign || previous?.assignment, '', 120),
    images,
    config: {
      maxHeroShufflesPerDay: config.maxHeroShufflesPerDay,
      maxHeroImagesPerDay: config.maxHeroImagesPerDay,
    },
    revision,
    updatedAt: new Date().toISOString(),
  };
}

export function parseStoredJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

export function getServableHeroPool(pool, { allowData = false } = {}) {
  if (!pool || !Array.isArray(pool.images)) return null;
  const images = pool.images
    .filter((img) => {
      const validUrl = allowData ? isLegacyHeroUrl(img.url) : isPublicImageUrl(img.url);
      return img && img.active !== false && img.enabled !== false && img.storeSafe !== false && validUrl;
    })
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return Number(b.weight || 1) - Number(a.weight || 1);
    });
  if (images.length === 0) return null;
  return {
    ...pool,
    images,
    defaultHeroId: images.find((img) => img.isDefault)?.id || images[0].id,
    revision: pool.revision || pool.updatedAt || null,
  };
}

function weightedExpandedList(images) {
  const expanded = [];
  for (const image of images) {
    const weight = Math.max(1, Math.min(10, Math.round(Number(image.weight || 1))));
    for (let i = 0; i < weight; i++) expanded.push(image);
  }
  return expanded.length ? expanded : images;
}

export function assignDailyHeroSet(pool, {
  installId = '',
  dateKey = getTodayKey(),
  count = 4,
  fallbackHero = null,
} = {}) {
  const servable = getServableHeroPool(pool);
  const baseImages = servable?.images || [];
  const picked = [];
  const seen = new Set();
  const seed = hashToUint(`${installId || 'anon'}|${dateKey}|${servable?.revision || servable?.updatedAt || '0'}`);
  const source = weightedExpandedList(baseImages);

  for (let step = 0; step < source.length && picked.length < count; step++) {
    const idx = ((seed + Math.imul(step + 1, 2654435761)) >>> 0) % source.length;
    const candidate = source[idx];
    if (!candidate || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    picked.push(candidate);
  }

  for (const candidate of baseImages) {
    if (picked.length >= count) break;
    if (!candidate || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    picked.push(candidate);
  }

  const fallback = fallbackHero?.images?.[0] || fallbackHero || null;
  if (picked.length < count && fallback?.url && !seen.has(fallback.id || fallback.url)) {
    picked.push({
      ...fallback,
      id: fallback.id || `legacy_${hashString(fallback.url).slice(0, 8)}`,
      fallback: true,
      isDefault: picked.length === 0,
    });
  }

  if (!picked.length) return null;

  return {
    ...(servable || {}),
    dateKey,
    images: picked.map((img, index) => ({ ...img, isDefault: index === 0 })),
    defaultHeroId: picked[0].id,
    assignment: {
      assigned: true,
      sourcePoolCount: baseImages.length,
      assignedCount: picked.length,
      targetCount: count,
      installScoped: !!installId,
    },
    revision: servable?.revision || fallback?.revision || fallback?.updatedAt || null,
    updatedAt: servable?.updatedAt || fallback?.updatedAt || null,
  };
}

export function legacyHeroAsPool(heroImage, dateKey = getTodayKey()) {
  if (!heroImage || heroImage.enabled === false || !heroImage.url || !isLegacyHeroUrl(heroImage.url)) {
    return null;
  }
  const image = normalizeHeroImage({
    ...heroImage,
    id: heroImage.id || `legacy_${hashString(heroImage.url).slice(0, 8)}`,
    title: heroImage.alt || 'Today reader',
    readerMood: heroImage.readerMood || 'The Mirror',
    headline: heroImage.headline || 'The reader for today is here',
    cta: heroImage.cta || 'Let her draw your first signal',
    isDefault: true,
  }, 0, dateKey, { allowData: true });
  if (!image) return null;
  return {
    dateKey,
    images: [image],
    config: {
      maxHeroShufflesPerDay: DEFAULT_MONETIZATION_CONFIG.maxHeroShufflesPerDay,
      maxHeroImagesPerDay: DEFAULT_MONETIZATION_CONFIG.maxHeroImagesPerDay,
    },
    revision: heroImage.revision || heroImage.updatedAt || null,
    updatedAt: heroImage.updatedAt || null,
    legacy: true,
  };
}
