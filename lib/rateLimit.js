/**
 * Lightweight in-memory rate limiter — no Redis/external dependency needed
 * for a single-instance deployment. Tracks request counts per (IP, bucket)
 * in a sliding window. This intentionally does NOT persist across server
 * restarts and does NOT work correctly across multiple server instances
 * (each instance has its own memory) — for a multi-instance production
 * deployment, swap this for a shared store (Redis, Upstash, etc.) using
 * the same checkRateLimit(req, bucket, max, windowMs) signature.
 */

const buckets = new Map(); // key -> [timestamps]

function getClientIp(req) {
  // Respect a trusted reverse-proxy header if present, else fall back to
  // whatever Next.js exposes. Note: X-Forwarded-For is client-settable if
  // there's no proxy in front — this is a best-effort identifier for
  // slowing down abuse, not a strong identity guarantee.
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export function checkRateLimit(req, bucketName, max, windowMs) {
  const ip = getClientIp(req);
  const key = `${bucketName}:${ip}`;
  const now = Date.now();

  let timestamps = buckets.get(key) || [];
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= max) {
    return { allowed: false, retryAfterMs: windowMs - (now - timestamps[0]) };
  }

  timestamps.push(now);
  buckets.set(key, timestamps);

  // Periodic cleanup so the map doesn't grow unbounded over a long-running process
  if (buckets.size > 5000) {
    for (const [k, ts] of buckets.entries()) {
      const fresh = ts.filter((t) => now - t < windowMs);
      if (fresh.length === 0) buckets.delete(k);
      else buckets.set(k, fresh);
    }
  }

  return { allowed: true };
}
