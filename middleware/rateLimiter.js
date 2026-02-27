/**
 * Rate Limiting Middleware
 *
 * Dual-layer strategy:
 *  1. express-rate-limit (in-memory, per process) — fast, no deps
 *  2. Redis sliding-window (optional, cross-process) — for horizontal scaling
 *
 * Horizontal scaling note:
 *  When multiple Node processes run behind a load balancer, each process has
 *  its own in-memory counter. To enforce a TRUE global rate limit across all
 *  instances, the Redis layer must be used. If Redis is unavailable, the
 *  in-memory limiter still protects each individual instance.
 */

const rateLimit = require('express-rate-limit');

/* ── In-memory limiters (express-rate-limit) ────────────────── */

/** General API — 100 req/min */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: { message: 'Too many requests, please try again in a minute.' },
});

/** Session creation — 10 req/15 min per university */
const createSessionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => req.user?._id?.toString() || req.ip,
    validate: false,
    message: { message: 'Session creation rate limit reached. Try again later.' },
});

/** Signed URL requests — 30 req/min per user */
const signedUrlLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => req.user?._id?.toString() || req.ip,
    validate: false,
    message: { message: 'Signed URL rate limit exceeded.' },
});

/** Notification dispatch — 5 per session per day */
const notifLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `notif:${req.user?._id || req.ip}:${req.params.id}`,
    validate: false,
    message: { message: 'Notification dispatch limit reached for today.' },
});

/* ── Redis sliding-window (cross-process, optional) ─────────── */
/**
 * Redis-based rate limiter factory.
 * Uses a sorted-set sliding window: O(log N) per request.
 *
 * @param {string} prefix   - Key namespace (e.g. 'session_create')
 * @param {number} windowMs - Window size in ms
 * @param {number} maxReqs  - Max requests per window
 */
const redisRateLimiter = (prefix, windowMs, maxReqs) => async (req, res, next) => {
    const { getRedis, KEYS } = require('../utils/redisCache');
    const r = getRedis();
    if (!r) return next(); // degrade gracefully — in-memory limiter still active

    const key = KEYS.rateLimitKey(req.user?._id || req.ip, prefix);
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
        const pipeline = r.multi();
        pipeline.zRemRangeByScore(key, '-inf', windowStart); // purge old entries
        pipeline.zAdd(key, { score: now, value: `${now}` });
        pipeline.zCard(key);
        pipeline.expire(key, Math.ceil(windowMs / 1000));
        const results = await pipeline.exec();

        const count = results[2]; // zCard result
        if (count > maxReqs) {
            return res.status(429).json({
                message: `Rate limit exceeded. Max ${maxReqs} requests per ${windowMs / 1000}s.`,
            });
        }
        next();
    } catch {
        next(); // Redis error → let through
    }
};

module.exports = {
    apiLimiter,
    createSessionLimiter,
    signedUrlLimiter,
    notifLimiter,
    redisRateLimiter,
};
