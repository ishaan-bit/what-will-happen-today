/**
 * Dev/local-friendly hero batch media upload.
 *
 * Images keep the existing Redis-backed data URL path. MP4 videos are uploaded
 * to Vercel Blob and only the returned public Blob URL is stored.
 */
import { Redis } from '@upstash/redis';
import { put } from '@vercel/blob';
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

function isMp4FileName(fileName) {
  return /\.mp4$/i.test(String(fileName || ''));
}

function cleanFileName(value, fallback) {
  return String(value || fallback).replace(/[^\w.-]/g, '_').slice(0, 120);
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
  const publicUrl = String(body.videoUrl || body.url || body.mediaUrl || '').trim();
  const fileName = cleanFileName(body.fileName, publicUrl.split('/').pop() || 'hero-media');
  const posterUrl = String(body.posterUrl || body.poster || '').trim();

  if (publicUrl) {
    if (!/^https?:\/\/.+/i.test(publicUrl)) {
      return res.status(400).json({ error: 'invalid_media_url', message: 'Public media URL must start with http:// or https://.' });
    }
    const requestedType = String(body.mediaType || body.type || '').toLowerCase();
    const mediaType = requestedType === 'video' || isMp4FileName(fileName) || /\.mp4(\?.*)?$/i.test(publicUrl) ? 'video' : 'image';
    const contentType = mediaType === 'video' ? 'video/mp4' : String(body.contentType || 'image/jpeg');
    if (mediaType === 'video' && !isMp4FileName(fileName) && !/\.mp4(\?.*)?$/i.test(publicUrl)) {
      return res.status(400).json({ error: 'invalid_mp4_url', message: 'MP4 hero videos must use a .mp4 URL or .mp4 file name.' });
    }
    const id = `asset_${hashToUint(`${dateKey}|${fileName}|${publicUrl}`).toString(36)}`;
    const value = {
      id,
      dateKey,
      fileName,
      mediaType,
      type: mediaType,
      contentType,
      ...(mediaType === 'video' ? { videoUrl: publicUrl } : { url: publicUrl }),
      ...(posterUrl ? { posterUrl } : {}),
      bytes: Number(body.bytes || 0) || 0,
      createdAt: new Date().toISOString(),
    };
    await getRedis().set(assetKey(dateKey, id), JSON.stringify(value));
    console.log('[hero-batch-upload] registered asset', { dateKey, id, type: mediaType, contentType, url: publicUrl });
    return res.status(200).json({
      ok: true,
      id,
      dateKey,
      url: publicUrl,
      ...(mediaType === 'video' ? { videoUrl: publicUrl } : {}),
      mediaType,
      type: mediaType,
      bytes: value.bytes,
      contentType,
      ...(posterUrl ? { posterUrl } : {}),
    });
  }

  const parsed = parseDataUrl(body.dataUrl);
  if (!parsed) {
    return res.status(400).json({ error: 'invalid_media_data_url' });
  }

  const bytes = Math.ceil(parsed.base64.length * 0.75);
  if (bytes > MAX_DATA_URL_BYTES) {
    return res.status(413).json({
      error: parsed.contentType === 'video/mp4' ? 'video_too_large' : 'image_too_large',
      message: `${parsed.contentType === 'video/mp4' ? 'Video' : 'Image'} upload is ${bytes} bytes; max is ${MAX_DATA_URL_BYTES} bytes.`,
      maxBytes: MAX_DATA_URL_BYTES,
      bytes,
    });
  }

  const mediaType = parsed.contentType.startsWith('video/') ? 'video' : 'image';
  const id = `asset_${hashToUint(`${dateKey}|${fileName}|${parsed.base64.slice(0, 64)}`).toString(36)}`;
  if (mediaType === 'video') {
    if (parsed.contentType !== 'video/mp4' || !isMp4FileName(fileName)) {
      return res.status(400).json({ error: 'invalid_mp4_upload', message: 'Only video/mp4 files with a .mp4 extension are supported for hero videos.' });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(501).json({
        error: 'video_storage_not_configured',
        message: 'MP4 uploads require Vercel Blob storage. Set BLOB_READ_WRITE_TOKEN on the backend, then retry.',
      });
    }
    let blob;
    try {
      const buffer = Buffer.from(parsed.base64, 'base64');
      blob = await put(`hero-batch/${dateKey}/${id}-${fileName}`, buffer, {
        access: 'public',
        contentType: 'video/mp4',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
    } catch (err) {
      return res.status(502).json({
        error: 'blob_upload_failed',
        message: err?.message || 'Vercel Blob upload failed.',
      });
    }
    const value = {
      id,
      dateKey,
      fileName,
      mediaType,
      type: mediaType,
      contentType: parsed.contentType,
      videoUrl: blob.url,
      ...(posterUrl ? { posterUrl } : {}),
      bytes,
      createdAt: new Date().toISOString(),
    };
    await getRedis().set(assetKey(dateKey, id), JSON.stringify(value));
    console.log('[hero-batch-upload] uploaded asset', { dateKey, id, type: mediaType, contentType: parsed.contentType, bytes, url: blob.url });
    return res.status(200).json({
      ok: true,
      id,
      dateKey,
      url: blob.url,
      videoUrl: blob.url,
      mediaType,
      type: mediaType,
      bytes,
      contentType: parsed.contentType,
      ...(posterUrl ? { posterUrl } : {}),
    });
  }

  const value = {
    id,
    dateKey,
    fileName,
    mediaType,
    type: mediaType,
    contentType: parsed.contentType,
    base64: parsed.base64,
    bytes,
    createdAt: new Date().toISOString(),
  };

  await getRedis().set(assetKey(dateKey, id), JSON.stringify(value));

  const url = `${getBaseUrl(req)}/api/hero-batch/image?date=${encodeURIComponent(dateKey)}&id=${encodeURIComponent(id)}`;
  console.log('[hero-batch-upload] uploaded asset', { dateKey, id, type: mediaType, contentType: parsed.contentType, bytes });
  return res.status(200).json({ ok: true, id, dateKey, url, mediaType, type: mediaType, bytes, contentType: parsed.contentType });
}
