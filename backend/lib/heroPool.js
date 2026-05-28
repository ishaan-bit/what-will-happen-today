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

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input || {}, key);
}

function normalizeBooleanFlag(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = String(value).trim().toLowerCase();
  if (['true', 'on', '1', 'yes'].includes(normalized)) return true;
  if (['false', 'off', '0', 'no'].includes(normalized)) return false;
  return fallback;
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

function getBackendBaseUrl() {
  const raw = process.env.APP_BASE_URL
    || process.env.EXPO_PUBLIC_API_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  return String(raw || '').trim().replace(/\/$/, '');
}

function getInputMediaUrl(input = {}) {
  if (hasOwn(input, 'mediaUrl')) return input.mediaUrl;
  if (hasOwn(input, 'imageUrl')) return input.imageUrl;
  if (hasOwn(input, 'url')) return input.url;
  if (hasOwn(input, 'uri')) return input.uri;
  if (hasOwn(input, 'src')) return input.src;
  return '';
}

function normalizeMediaUrl(value) {
  const raw = cleanText(value, '', 2000);
  if (!raw) return '';
  if (/^\/api\/hero-batch\/image\?/i.test(raw)) {
    const base = getBackendBaseUrl();
    return base ? `${base}${raw}` : raw;
  }
  return raw;
}

function inferMediaType(input = {}, url = '') {
  const explicit = String(input.mediaType || '').trim().toLowerCase();
  if (explicit === 'video') return 'video';
  if (explicit === 'image') return 'image';
  return /\.(mp4|m4v|webm)(\?.*)?$/i.test(String(url || '')) ? 'video' : 'image';
}

function isBackendHeroBatchUrl(url) {
  const raw = String(url || '').trim();
  if (/^\/api\/hero-batch\/image\?[^#\s]+/i.test(raw)) return !!getBackendBaseUrl();
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    return parsed.pathname === '/api/hero-batch/image'
      && parsed.searchParams.has('date')
      && parsed.searchParams.has('id');
  } catch {
    return false;
  }
}

function isPublicMediaUrl(url) {
  const raw = String(url || '').trim();
  if (isBackendHeroBatchUrl(raw)) return true;
  return /^https?:\/\/.+/i.test(raw);
}

function isLegacyHeroUrl(url) {
  return isPublicMediaUrl(url) || /^data:image\//i.test(String(url || '').trim());
}

// Diagnostic logging helper; logs to console only in development.
function logDiagnostic(context, message, data = {}) {
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_HERO_POOL === 'true') {
    const sanitized = { ...data };
    if (sanitized.url && sanitized.url.length > 100) sanitized.url = sanitized.url.substring(0, 100) + '...';
    console.log(`[HeroPool.${context}]`, message, sanitized);
  }
}

export function normalizeHeroImage(input = {}, index = 0, dateKey = getTodayKey(), { allowData = false } = {}) {
  const url = allowData
    ? cleanText(getInputMediaUrl(input), '', 4_000_000)
    : normalizeMediaUrl(getInputMediaUrl(input));
  const mediaType = inferMediaType(input, url);
  const inputTitle = input.title || input.name || `Hero ${index + 1}`;
  const isValidUrl = allowData ? isLegacyHeroUrl(url) : isPublicMediaUrl(url);
  if (!isValidUrl) {
    logDiagnostic('normalizeHeroImage', `REJECTED: Invalid media URL format for "${inputTitle}"`, {
      index,
      title: inputTitle,
      urlPrefix: url ? url.substring(0, 50) : '(empty)',
      urlLength: url.length,
      allowData,
      hasHttps: url.startsWith('https'),
      hasHttp: url.startsWith('http'),
    });
    return null;
  }

  const id = cleanText(input.id, `hero_${dateKey}_${index + 1}_${hashString(url).slice(0, 6)}`, 80)
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  const weight = Math.max(0, Math.min(1000, parseInt(input.weight, 10) || 1));
  const title = cleanText(input.title || input.name, `Hero ${index + 1}`, 100);
  const readerMood = cleanText(input.readerMood || input.readerLabel || input.publicLabel, "Today's reader", 80);
  const active = normalizeBooleanFlag(input.active, true);
  const enabled = normalizeBooleanFlag(input.enabled, true);
  const storeSafe = normalizeBooleanFlag(input.storeSafe, true);
  const headline = cleanText(input.headline, '', 140);
  const cta = cleanText(input.cta || input.CTA || input.ctaCopy, '', 120);
  const isDefault = normalizeBooleanFlag(input.isDefault ?? input.default, false);
  const posterUrl = normalizeMediaUrl(input.posterUrl || input.poster || '');

  return {
    id,
    url,
    mediaUrl: url,
    mediaType,
    ...(mediaType === 'image' ? { imageUrl: url } : {}),
    ...(posterUrl ? { posterUrl } : {}),
    title,
    name: title,
    active,
    enabled,
    storeSafe,
    dateKey,
    campaign: cleanText(input.campaign || input.assignment, '', 80),
    tags: cleanTags(input.tags),
    readerMood,
    headline,
    cta,
    ...(hasOwn(input, 'CTA') ? { CTA: cta } : {}),
    weight,
    priority: weight,
    isDefault,
    default: isDefault,
    alt: cleanText(input.alt, title, 120),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

export function normalizeHeroPool(input = {}, previous = null) {
  const dateKey = normalizeDateKey(input.dateKey || input.date || previous?.dateKey);
  const inputImages = Array.isArray(input.images) ? input.images : [];
  const normalized = inputImages
    .map((item, index) => normalizeHeroImage(item, index, dateKey))
    .filter(Boolean);

  logDiagnostic('normalizeHeroPool', `Pool normalized for ${dateKey}`, {
    inputCount: inputImages.length,
    normalizedCount: normalized.length,
    droppedByNormalization: inputImages.length - normalized.length,
  });

  const images = normalized;
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
  if (!pool || !Array.isArray(pool.images)) {
    logDiagnostic('getServableHeroPool', 'NULL POOL: No images array', { poolExists: !!pool, hasImages: pool?.images !== undefined });
    return null;
  }

  const inputCount = pool.images.length;
  const normalizedImages = pool.images.map((img) => {
    if (!img) return img;
    const url = allowData
      ? cleanText(getInputMediaUrl(img), '', 4_000_000)
      : normalizeMediaUrl(getInputMediaUrl(img));
    const mediaType = inferMediaType(img, url);
    const cta = cleanText(img.cta || img.CTA || img.ctaCopy, '', 120);
    const posterUrl = normalizeMediaUrl(img.posterUrl || img.poster || '');
    return {
      ...img,
      url,
      mediaUrl: url,
      mediaType,
      ...(mediaType === 'image' ? { imageUrl: url } : {}),
      ...(posterUrl ? { posterUrl } : {}),
      active: normalizeBooleanFlag(img.active, true),
      enabled: normalizeBooleanFlag(img.enabled, true),
      storeSafe: normalizeBooleanFlag(img.storeSafe, true),
      isDefault: normalizeBooleanFlag(img.isDefault ?? img.default, false),
      default: normalizeBooleanFlag(img.isDefault ?? img.default, false),
      cta,
      ...(hasOwn(img, 'CTA') ? { CTA: cta } : {}),
    };
  });
  const filtered = normalizedImages.filter((img) => {
    const validUrl = allowData ? isLegacyHeroUrl(img?.url) : isPublicMediaUrl(img?.url);
    const activeOk = normalizeBooleanFlag(img?.active, true);
    const enabledOk = normalizeBooleanFlag(img?.enabled, true);
    const safeOk = normalizeBooleanFlag(img?.storeSafe, true);
    const urlOk = validUrl;
    const passes = img && activeOk && enabledOk && safeOk && urlOk;

    if (!passes) {
      logDiagnostic('getServableHeroPool', `DROPPED: "${img?.title || img?.name || '?'}"`, {
        id: img?.id,
        title: img?.title || img?.name,
        active: img?.active,
        enabled: img?.enabled,
        storeSafe: img?.storeSafe,
        urlPrefix: img?.url ? img.url.substring(0, 50) : '(missing)',
        urlOk,
        activeOk,
        enabledOk,
        safeOk,
        reason: !img ? 'null_image' : !urlOk ? 'invalid_url' : !activeOk ? 'active_false' : !enabledOk ? 'enabled_false' : !safeOk ? 'storeSafe_false' : 'unknown',
      });
    } else {
      logDiagnostic('getServableHeroPool', `PASS: "${img?.title || img?.name}"`, {
        id: img?.id,
        active: img?.active,
        enabled: img?.enabled,
        storeSafe: img?.storeSafe,
      });
    }
    return passes;
  })
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return Number(b.weight || 1) - Number(a.weight || 1);
    });

  logDiagnostic('getServableHeroPool', `Filter complete for ${pool.dateKey}`, {
    inputCount,
    filteredCount: filtered.length,
    dropped: inputCount - filtered.length,
  });

  if (filtered.length === 0) {
    logDiagnostic('getServableHeroPool', `EMPTY RESULT: All ${inputCount} images dropped`, { dateKey: pool.dateKey });
    return null;
  }

  return {
    ...pool,
    images: filtered,
    defaultHeroId: filtered.find((img) => img.isDefault)?.id || filtered[0].id,
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
    readerMood: heroImage.readerMood || "Today's reader",
    headline: heroImage.headline || '',
    cta: heroImage.cta || '',
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
