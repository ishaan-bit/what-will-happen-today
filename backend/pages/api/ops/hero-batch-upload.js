/**
 * Dev/local-friendly hero batch media upload.
 *
 * This stores data URLs in namespaced Redis asset keys and returns a
 * production-fetchable backend URL. It is additive and does not touch
 * wwht:heroImage. For high-volume production use, replace this with object
 * storage/CDN and keep the same returned URL contract.
 */
import { Redis } from '@upstash/redis';
import { requireOpsAuth } from '@/lib/opsAuth';
import { hashToUint, normalizeDateKey } from '@/lib/heroPool';

const MAX_DATA_URL_BYTES = parseInt(process.env.HERO_BATCH_UPLOAD_MAX_BYTES || '12000000', 10);
const ASSET_PREFIX = 'wwht:heroBatchAsset:';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

function assetKey(dateKey, id) {
  return `${ASSET_PREFIX}${dateKey}:${id}`;
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|jpg|png|webp)|video\/mp4);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  return {
    contentType: match[1] === 'image/jpg' ? 'image/jpeg' : match[1],
    base64: match[2],
  };
}

function getBaseUrl(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export const config = {
  api: { bodyParser: { sizeLimit: '16mb' } },
};

export default async function handler(req, res) {
  if (!requireOpsAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = req.body || {};
  const dateKey = normalizeDateKey(body.dateKey || body.date);
  const parsed = parseDataUrl(body.dataUrl);
  if (!parsed) {
    return res.status(400).json({ error: 'invalid_media_data_url' });
  }

  const bytes = Math.ceil(parsed.base64.length * 0.75);
  if (bytes > MAX_DATA_URL_BYTES) {
    return res.status(413).json({
      error: 'image_too_large',
      maxBytes: MAX_DATA_URL_BYTES,
      bytes,
    });
  }

  const mediaType = parsed.contentType.startsWith('video/') ? 'video' : 'image';
  const fileName = String(body.fileName || `hero-${mediaType}`).replace(/[^\w.-]/g, '_').slice(0, 120);
  const id = `asset_${hashToUint(`${dateKey}|${fileName}|${parsed.base64.slice(0, 64)}`).toString(36)}`;
  const value = {
    id,
    dateKey,
    fileName,
    mediaType,
    contentType: parsed.contentType,
    base64: parsed.base64,
    bytes,
    createdAt: new Date().toISOString(),
  };

  await getRedis().set(assetKey(dateKey, id), JSON.stringify(value));

  const url = `${getBaseUrl(req)}/api/hero-batch/image?date=${encodeURIComponent(dateKey)}&id=${encodeURIComponent(id)}`;
  return res.status(200).json({ ok: true, id, dateKey, url, mediaType, bytes, contentType: parsed.contentType });
}
