/**
 * Redis Cache Layer for Live Sessions
 *
 * Strategy:
 *  - Session status cached for 30s (near-real-time staleness)
 *  - Full session list cached per university for 60s
 *  - Signed playback URLs cached for TTL - 60s (safety buffer)
 *  - Separate keys for student notification dedup
 *
 * Pattern: Cache-aside (read → miss → DB → write cache → serve)
 */

let redis = null;

/**
 * Lazy-init Redis client.
 * Falls back gracefully to null if Redis is unavailable —
 * DB is always the source of truth.
 */
const getRedis = () => {
    if (redis) return redis;

    // Prevent fallback to localhost which causes infinite loops on Render
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl || redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1')) {
        return null;
    }

    try {
        const { createClient } = require('redis');
        redis = createClient({
            url: redisUrl,
            socket: {
                reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
                connectTimeout: 5000,
            },
        });

        redis.on('error', (err) => {
            console.warn('[Redis] connection error — falling back to DB:', err.message);
            redis = null; // reset so next call retries
        });

        redis.connect().catch(err => {
            console.warn('[Redis] connect failed:', err.message);
            redis = null;
        });
    } catch (e) {
        console.warn('[Redis] not available:', e.message);
        redis = null;
    }
    return redis;
};

/* ── Key builders ───────────────────────────────────────────── */
const KEYS = {
    sessionStatus: (id) => `live:status:${id}`,
    sessionFull: (id) => `live:session:${id}`,
    uniSessions: (uniId) => `live:uni:${uniId}:sessions`,
    signedUrl: (id, uid) => `live:signed:${id}:${uid}`,
    notifSent: (id, uid) => `live:notif:${id}:${uid}`,
    rateLimitKey: (ip, path) => `ratelimit:${ip}:${path}`,
};

/* ── Generic helpers ───────────────────────────────────────── */
const cacheGet = async (key) => {
    const r = getRedis();
    if (!r) return null;
    try {
        const val = await r.get(key);
        return val ? JSON.parse(val) : null;
    } catch { return null; }
};

const cacheSet = async (key, value, ttlSeconds) => {
    const r = getRedis();
    if (!r) return;
    try {
        await r.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch { /* non-fatal */ }
};

const cacheDel = async (...keys) => {
    const r = getRedis();
    if (!r) return;
    try { await r.del(keys); } catch { /* non-fatal */ }
};

/* ── Domain-specific cache ops ─────────────────────────────── */

/** Cache live status for 30s (frequent polling safe) */
const cacheSessionStatus = async (sessionId, status) =>
    cacheSet(KEYS.sessionStatus(sessionId), { status }, 30);

const getSessionStatus = async (sessionId) =>
    cacheGet(KEYS.sessionStatus(sessionId));

/** Cache full session document for 60s */
const cacheSession = async (session) =>
    cacheSet(KEYS.sessionFull(session._id.toString()), session, 60);

const getCachedSession = async (sessionId) =>
    cacheGet(KEYS.sessionFull(sessionId));

/** Cache university's session list for 60s */
const cacheUniSessions = async (universityId, sessions) =>
    cacheSet(KEYS.uniSessions(universityId), sessions, 60);

const getCachedUniSessions = async (universityId) =>
    cacheGet(KEYS.uniSessions(universityId));

/** Cache signed playback URL (TTL - 60s safety buffer) */
const cacheSignedUrl = async (sessionId, userId, signed, ttlSeconds) =>
    cacheSet(KEYS.signedUrl(sessionId, userId), signed, ttlSeconds - 60);

const getCachedSignedUrl = async (sessionId, userId) =>
    cacheGet(KEYS.signedUrl(sessionId, userId));

/** Notification dedup: mark as sent (24h TTL) */
const markNotifSent = async (sessionId, studentId) =>
    cacheSet(KEYS.notifSent(sessionId, studentId), true, 86400);

const wasNotifSent = async (sessionId, studentId) =>
    cacheGet(KEYS.notifSent(sessionId, studentId));

/** Invalidate all caches for a session (on status change) */
const invalidateSession = async (sessionId, universityId) => {
    await cacheDel(
        KEYS.sessionStatus(sessionId),
        KEYS.sessionFull(sessionId),
        KEYS.uniSessions(universityId),
    );
};

module.exports = {
    cacheSessionStatus,
    getSessionStatus,
    cacheSession,
    getCachedSession,
    cacheUniSessions,
    getCachedUniSessions,
    cacheSignedUrl,
    getCachedSignedUrl,
    markNotifSent,
    wasNotifSent,
    invalidateSession,
    KEYS,
    getRedis,
};
