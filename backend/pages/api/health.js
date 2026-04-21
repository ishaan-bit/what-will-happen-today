export default function handler(req, res) {
  res.status(200).json({ ok: true, env: { redis: !!process.env.UPSTASH_REDIS_REST_URL } });
}
