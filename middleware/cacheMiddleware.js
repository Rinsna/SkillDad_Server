/**
 * Cache Middleware
 * Provides caching for exam-related API endpoints
 * 
 * Requirements: 18.7
 */

const cacheService = require('../services/cacheService');

/**
 * Cache exam details with 5-minute TTL
 * Caches GET requests for exam details
 * 
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
 */
const cacheExamDetails = (ttl = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const examId = req.params.examId || req.params.id;
    if (!examId) {
      return next();
    }

    const cacheKey = `exam:${examId}`;

    try {
      // Try to get from cache
      const cachedData = await cacheService.get(cacheKey);
      
      if (cachedData) {
        console.log(`[CacheMiddleware] Cache HIT for ${cacheKey}`);
        return res.status(200).json(cachedData);
      }

      console.log(`[CacheMiddleware] Cache MISS for ${cacheKey}`);

      // Store original res.json to intercept response
      const originalJson = res.json.bind(res);
      
      res.json = (data) => {
        // Cache successful responses
        if (res.statusCode === 200 && data.success !== false) {
          cacheService.set(cacheKey, data, ttl).catch(err => {
            console.error('[CacheMiddleware] Error caching response:', err);
          });
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('[CacheMiddleware] Cache error:', error);
      next(); // Continue without cache on error
    }
  };
};

/**
 * Cache question list until exam starts
 * Questions are cached with longer TTL before exam starts
 * 
 * @param {number} ttl - Time to live in seconds (default: 600 = 10 minutes)
 */
const cacheQuestions = (ttl = 600) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const examId = req.params.examId;
    if (!examId) {
      return next();
    }

    const cacheKey = `exam:${examId}:questions`;

    try {
      // Try to get from cache
      const cachedData = await cacheService.get(cacheKey);
      
      if (cachedData) {
        console.log(`[CacheMiddleware] Cache HIT for ${cacheKey}`);
        return res.status(200).json(cachedData);
      }

      console.log(`[CacheMiddleware] Cache MISS for ${cacheKey}`);

      // Store original res.json to intercept response
      const originalJson = res.json.bind(res);
      
      res.json = (data) => {
        // Cache successful responses
        if (res.statusCode === 200 && data.success !== false) {
          cacheService.set(cacheKey, data, ttl).catch(err => {
            console.error('[CacheMiddleware] Error caching response:', err);
          });
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('[CacheMiddleware] Cache error:', error);
      next(); // Continue without cache on error
    }
  };
};

/**
 * Cache exam list with pagination
 * 
 * @param {number} ttl - Time to live in seconds (default: 180 = 3 minutes)
 */
const cacheExamList = (ttl = 180) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Create cache key from query parameters
    const queryString = JSON.stringify(req.query);
    const cacheKey = `exams:list:${Buffer.from(queryString).toString('base64')}`;

    try {
      // Try to get from cache
      const cachedData = await cacheService.get(cacheKey);
      
      if (cachedData) {
        console.log(`[CacheMiddleware] Cache HIT for exam list`);
        return res.status(200).json(cachedData);
      }

      console.log(`[CacheMiddleware] Cache MISS for exam list`);

      // Store original res.json to intercept response
      const originalJson = res.json.bind(res);
      
      res.json = (data) => {
        // Cache successful responses
        if (res.statusCode === 200 && data.success !== false) {
          cacheService.set(cacheKey, data, ttl).catch(err => {
            console.error('[CacheMiddleware] Error caching response:', err);
          });
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('[CacheMiddleware] Cache error:', error);
      next(); // Continue without cache on error
    }
  };
};

/**
 * Invalidate exam cache on updates
 * Call this after exam modifications
 * 
 * @param {string} examId - Exam ID to invalidate
 */
async function invalidateExamCache(examId) {
  try {
    // Delete specific exam cache
    await cacheService.del(`exam:${examId}`);
    await cacheService.del(`exam:${examId}:questions`);
    
    // Delete exam list caches (all variations)
    await cacheService.delPattern('exams:list:*');
    
    console.log(`[CacheMiddleware] Invalidated cache for exam ${examId}`);
  } catch (error) {
    console.error('[CacheMiddleware] Error invalidating cache:', error);
  }
}

/**
 * Invalidate all exam-related caches
 */
async function invalidateAllExamCaches() {
  try {
    await cacheService.delPattern('exam:*');
    await cacheService.delPattern('exams:*');
    console.log('[CacheMiddleware] Invalidated all exam caches');
  } catch (error) {
    console.error('[CacheMiddleware] Error invalidating all caches:', error);
  }
}

module.exports = {
  cacheExamDetails,
  cacheQuestions,
  cacheExamList,
  invalidateExamCache,
  invalidateAllExamCaches
};
