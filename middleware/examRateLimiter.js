const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');

/**
 * Rate Limiting Middleware for Exam System
 * Implements different rate limits for various exam operations
 */

// Initialize Redis client if available
let redisClient = null;
let redisStore = null;

try {
  if (process.env.REDIS_URL) {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis connection failed after 10 retries');
            return new Error('Redis connection failed');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis client connected for rate limiting');
    });

    redisClient.connect().then(() => {
      redisStore = new RedisStore({
        client: redisClient,
        prefix: 'rl:exam:',
      });
    }).catch((err) => {
      console.error('Failed to connect Redis for rate limiting:', err);
    });
  }
} catch (error) {
  console.warn('Redis not available for rate limiting, using memory store:', error.message);
}

/**
 * Custom key generator that includes user ID for authenticated requests
 */
const keyGenerator = (req) => {
  if (req.user && req.user._id) {
    return `user:${req.user._id}`;
  }
  return req.ip;
};

/**
 * Custom handler for rate limit exceeded
 */
const rateLimitHandler = (req, res) => {
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please try again later.',
    retryAfter: res.getHeader('Retry-After')
  });
};

/**
 * General API rate limiter
 * Limit: 100 requests per 15 minutes per user/IP
 */
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this user/IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore || undefined,
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    // Skip rate limiting for admin users
    return req.user && req.user.role && req.user.role.toLowerCase() === 'admin';
  }
});

/**
 * File upload rate limiter
 * Limit: 10 uploads per hour per user
 */
const fileUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many file uploads. Limit is 10 uploads per hour.',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore || undefined,
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    // Skip rate limiting for admin users
    return req.user && req.user.role && req.user.role.toLowerCase() === 'admin';
  }
});

/**
 * Exam start rate limiter
 * Limit: 3 attempts per exam per student
 * This prevents students from repeatedly starting exams
 */
const examStartLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3,
  message: 'Too many exam start attempts. Maximum 3 attempts per exam per day.',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore || undefined,
  keyGenerator: (req) => {
    // Use combination of user ID and exam ID for exam-specific limiting
    const userId = req.user ? req.user._id : req.ip;
    const examId = req.params.examId || 'unknown';
    return `exam-start:${userId}:${examId}`;
  },
  handler: rateLimitHandler,
  skip: (req) => {
    // Skip rate limiting for admin and university users
    const role = req.user && req.user.role ? req.user.role.toLowerCase() : '';
    return role === 'admin' || role === 'university';
  }
});

/**
 * Answer submission rate limiter
 * Limit: 60 submissions per minute per user (1 per second)
 * Prevents rapid-fire answer submissions
 */
const answerSubmissionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: 'Too many answer submissions. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore || undefined,
  keyGenerator,
  handler: rateLimitHandler
});

/**
 * Result viewing rate limiter
 * Limit: 30 requests per 5 minutes per user
 */
const resultViewLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30,
  message: 'Too many result view requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore || undefined,
  keyGenerator,
  handler: rateLimitHandler
});

/**
 * Grading rate limiter
 * Limit: 50 grading operations per hour per university user
 */
const gradingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: 'Too many grading operations. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore || undefined,
  keyGenerator,
  handler: rateLimitHandler,
  skip: (req) => {
    // Skip rate limiting for admin users
    return req.user && req.user.role && req.user.role.toLowerCase() === 'admin';
  }
});

/**
 * Exam creation rate limiter
 * Limit: 20 exam creations per hour per user
 */
const examCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: 'Too many exam creation requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore || undefined,
  keyGenerator,
  handler: rateLimitHandler
});

/**
 * Question creation rate limiter
 * Limit: 100 questions per hour per user
 */
const questionCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: 'Too many question creation requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore || undefined,
  keyGenerator,
  handler: rateLimitHandler
});

/**
 * Cleanup function to close Redis connection
 */
const cleanup = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('Redis client disconnected');
    } catch (error) {
      console.error('Error disconnecting Redis client:', error);
    }
  }
};

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

module.exports = {
  generalApiLimiter,
  fileUploadLimiter,
  examStartLimiter,
  answerSubmissionLimiter,
  resultViewLimiter,
  gradingLimiter,
  examCreationLimiter,
  questionCreationLimiter,
  cleanup
};
