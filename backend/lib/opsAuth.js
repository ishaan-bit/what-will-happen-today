/**
 * Tiny shared ops auth helper.
 * Pass a plain shared secret via OPS_KEY env var.
 * Clients send it as the X-Ops-Key header.
 */
import { timingSafeEqual } from 'node:crypto';

export function requireOpsAuth(req, res) {
  const expected = process.env.OPS_KEY;
  if (!expected) {
    res.status(503).json({ error: 'ops_disabled', message: 'OPS_KEY not configured on server' });
    return false;
  }
  const provided = req.headers['x-ops-key'] || '';
  if (typeof provided !== 'string' || provided.length !== expected.length) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  try {
    const ok = timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) {
      res.status(401).json({ error: 'unauthorized' });
      return false;
    }
  } catch {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}
