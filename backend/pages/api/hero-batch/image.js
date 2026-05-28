/**
 * Public image endpoint for Redis-backed hero batch uploads.
 */
import { Redis } from '@upstash/redis';
import { normalizeDateKey } from '@/lib/heroPool';

const ASSET_PREFIX = 'wwht:heroBatchAsset:';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

function assetKey(dateKey, id) {
  return `${ASSET_PREFIX}${dateKey}:${id}`;
}

function parseStored(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const dateKey = normalizeDateKey(req.query.date);
  const id = String(req.query.id || '').replace(/[^\w-]/g, '').slice(0, 80);
  if (!id) return res.status(400).json({ error: 'id_required' });

  const asset = parseStored(await getRedis().get(assetKey(dateKey, id)));
  if (!asset?.base64 || !asset?.contentType) {
    return res.status(404).json({ error: 'not_found' });
  }

  const buffer = Buffer.from(asset.base64, 'base64');
  const range = req.headers.range;
  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  res.setHeader('Accept-Ranges', 'bytes');

  if (range) {
    const match = String(range).match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : buffer.length - 1;
      const safeStart = Math.max(0, Math.min(start, buffer.length - 1));
      const safeEnd = Math.max(safeStart, Math.min(end, buffer.length - 1));
      const chunk = buffer.subarray(safeStart, safeEnd + 1);
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${safeStart}-${safeEnd}/${buffer.length}`);
      res.setHeader('Content-Length', String(chunk.length));
      return res.end(chunk);
    }
  }

  res.setHeader('Content-Length', String(buffer.length));
  return res.status(200).send(buffer);
}
