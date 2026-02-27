const rateLimit = require('express-rate-limit');

/**
 * Payment Rate Limiting Middleware
 * 
 * Implements rate limiting for payment endpoints using express-rate-limit with Redis store.
 * Protects against abuse and ensures fair usage of payment gateway resources.
 * 
 * Rate Limits:
 * - Payment initiation: 5 requests/min per user
 * - Payment retry: 3 requests/hour per transaction
 * - Admin refunds: 10 requests/hour per admin
 * - Reconciliation: 10 requests/day
 */

const getRedisStore = () => {
  // If REDIS_HOST is 'localhost' or empty, gracefully fallback to MemoryStore.
  // This absolutely prevents the endless connection loop on Render since there is no local Redis there.
  if (!process.env.REDIS_HOST || process.env.REDIS_HOST === 'localhost' || process.env.REDIS_HOST === '127.0.0.1') {
    return undefined;
  }

  try {
    const { RedisStore } = require('rate-limit-redis');
    const redis = require('redis');

    const redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      socket: {
        connectTimeout: 5000,
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis rate limiter error:', err.message);
    });

    redisClient.connect().catch((err) => {
      console.error('Failed to connect Redis for rate limiting:', err.message);
    });

    return new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:payment:',
    });
  } catch (error) {
    console.warn('Redis not available for rate limiting, using memory store:', error.message);
    return undefined; // Falls back to memory store
  }
};

/**
 * Rate limiter for payment initiation
 * Limit: 5 requests per minute per user
 * POST /api/payment/initiate
 */
const paymentInitiateLimiter = rateLimit({
  store: getRedisStore(),
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per window
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP address
    return req.user?.id || req.user?._id?.toString() || req.ip;
  },
  message: {
    success: false,
    message: 'Too many payment attempts. Please try again in a minute.',
    retryAfter: 60,
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  validate: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many payment attempts. Please try again in a minute.',
      retryAfter: 60,
    });
  },
});

/**
 * Rate limiter for payment retry
 * Limit: 3 requests per hour per transaction
 * POST /api/payment/retry/:transactionId
 */
const paymentRetryLimiter = rateLimit({
  store: getRedisStore(),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 retries per hour
  keyGenerator: (req) => {
    // Use transaction ID as key to limit retries per transaction
    return `retry:${req.params.transactionId}`;
  },
  message: {
    success: false,
    message: 'Retry limit exceeded. Please create a new payment session or contact support.',
    retryAfter: 3600,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Retry limit exceeded. Please create a new payment session or contact support.',
      retryAfter: 3600,
    });
  },
});

/**
 * Rate limiter for admin refund operations
 * Limit: 10 requests per hour per admin
 * POST /api/admin/payment/refund
 */
const refundLimiter = rateLimit({
  store: getRedisStore(),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 refunds per hour
  keyGenerator: (req) => {
    // Use admin user ID as key
    return `refund:${req.user?.id || req.user?._id?.toString() || req.ip}`;
  },
  message: {
    success: false,
    message: 'Refund rate limit exceeded. Please try again later.',
    retryAfter: 3600,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Refund rate limit exceeded. Please try again later.',
      retryAfter: 3600,
    });
  },
});

/**
 * Rate limiter for reconciliation operations
 * Limit: 10 requests per day
 * POST /api/admin/reconciliation/run
 */
const reconciliationLimiter = rateLimit({
  store: getRedisStore(),
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, // 10 reconciliations per day
  keyGenerator: (req) => {
    // Use a global key for reconciliation (organization-wide limit)
    return 'reconciliation:global';
  },
  message: {
    success: false,
    message: 'Daily reconciliation limit reached. Please try again tomorrow.',
    retryAfter: 86400,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Daily reconciliation limit reached. Please try again tomorrow.',
      retryAfter: 86400,
    });
  },
});

/**
 * Rate limiter for payment status checks
 * Limit: 10 requests per minute per user
 * GET /api/payment/status/:transactionId
 */
const statusCheckLimiter = rateLimit({
  store: getRedisStore(),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  keyGenerator: (req) => {
    return req.user?.id || req.user?._id?.toString() || req.ip;
  },
  message: {
    success: false,
    message: 'Too many status check requests. Please try again in a minute.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

/**
 * Rate limiter for payment history
 * Limit: 10 requests per minute per user
 * GET /api/payment/history
 */
const historyLimiter = rateLimit({
  store: getRedisStore(),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  keyGenerator: (req) => {
    return req.user?.id || req.user?._id?.toString() || req.ip;
  },
  message: {
    success: false,
    message: 'Too many history requests. Please try again in a minute.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

/**
 * Rate limiter for admin configuration endpoints
 * Limit: 20 requests per minute per admin
 * GET/PUT /api/admin/payment/config
 */
const configLimiter = rateLimit({
  store: getRedisStore(),
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  keyGenerator: (req) => {
    return `config:${req.user?.id || req.user?._id?.toString() || req.ip}`;
  },
  message: {
    success: false,
    message: 'Too many configuration requests. Please try again in a minute.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

/**
 * Rate limiter for monitoring endpoints
 * Limit: 20 requests per minute per admin
 * GET /api/admin/monitoring/*
 */
const monitoringLimiter = rateLimit({
  store: getRedisStore(),
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  keyGenerator: (req) => {
    return `monitoring:${req.user?.id || req.user?._id?.toString() || req.ip}`;
  },
  message: {
    success: false,
    message: 'Too many monitoring requests. Please try again in a minute.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

module.exports = {
  paymentInitiateLimiter,
  paymentRetryLimiter,
  refundLimiter,
  reconciliationLimiter,
  statusCheckLimiter,
  historyLimiter,
  configLimiter,
  monitoringLimiter,
};
