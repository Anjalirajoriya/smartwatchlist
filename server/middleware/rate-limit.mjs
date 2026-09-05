/** Redis is shared across API instances; memory fallback keeps local development safe. */
const memory = new Map()
export function rateLimit({ cache, limit = 10, windowSeconds = 86400 }) {
  return async (req, res, next) => {
    // Default evidence view is template-only and consumes no LLM tokens.
    if (!String(req.body?.question || '').trim()) return next()
    const key = `limit:${req.user?.id || req.ip}:${req.path}`, now = Date.now()
    try {
      if (cache) { const n = await cache.incr(key); if (n === 1) await cache.expire(key, windowSeconds); if (n > limit) return res.status(429).json({ error: 'Daily follow-up limit reached. Try again tomorrow.' }) }
      else { const item = memory.get(key); const current = !item || item.expires < now ? { n: 0, expires: now + windowSeconds * 1000 } : item; current.n++; memory.set(key, current); if (current.n > limit) return res.status(429).json({ error: 'Daily follow-up limit reached. Try again tomorrow.' }) }
      next()
    } catch { next() }
  }
}
