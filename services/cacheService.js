/**
 * Cache Service
 * Provides caching functionality with Redis (if available) or in-memory fallback
 * 
 * Requirements: 18.7
 */

let redis = null;
let isRedisAvailable = false;

// In-memory cache fallback
const memoryCache = new Map();

/**
 * Initialize Redis connection (optional)
 * Falls back to in-memory cache if Redis is not available
 */
async function initializeCache() {
  try {
    // Only try to connect to Redis if REDIS_URL is configured
    if (process.env.REDIS_URL) {
      const Redis = require('ioredis');
      redis = new Redis(process.env.REDIS_URL, {
        retryStrategy: (times) => {
          if (times > 3) {
            console.log('[CacheService] Redis connection failed, using in-memory cache');
            return null; // Stop retrying
          }
          return Math.min(times * 100, 2000);
        },
        maxRetriesPerRequest: 3
      });

      redis.on('connect', () => {
        isRedisAvailable = true;
        console.log('[CacheService] Redis connected successfully');
      });

      redis.on('error', (err) => {
        isRedisAvailable = false;
        console.log('[CacheService] Redis error, falling back to in-memory cache:', err.message);
      });

      // Test connection
      await redis.ping();
      isRedisAvailable = true;
    } else {
      console.log('[CacheService] Redis not configured, using in-memory cache');
    }
  } catch (error) {
    isRedisAvailable = false;
    console.log('[CacheService] Redis initialization failed, using in-memory cache:', error.message);
  }
}

/**
 * Get value from cache
 * 
 * @param {string} key - Cache key
 * @returns {Promise<any>} Cached value or null
 */
async function get(key) {
  try {
    if (isRedisAvailable && redis) {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } else {
      // In-memory fallback
      const cached = memoryCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      } else if (cached) {
        memoryCache.delete(key); // Remove expired entry
      }
      return null;
    }
  } catch (error) {
    console.error('[CacheService] Error getting from cache:', error);
    return null;
  }
}

/**
 * Set value in cache with TTL
 * 
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
 * @returns {Promise<boolean>} Success status
 */
async function set(key, value, ttl = 300) {
  try {
    if (isRedisAvailable && redis) {
      await redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } else {
      // In-memory fallback
      memoryCache.set(key, {
        value,
        expiresAt: Date.now() + (ttl * 1000)
      });
      return true;
    }
  } catch (error) {
    console.error('[CacheService] Error setting cache:', error);
    return false;
  }
}

/**
 * Delete value from cache
 * 
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Success status
 */
async function del(key) {
  try {
    if (isRedisAvailable && redis) {
      await redis.del(key);
      return true;
    } else {
      memoryCache.delete(key);
      return true;
    }
  } catch (error) {
    console.error('[CacheService] Error deleting from cache:', error);
    return false;
  }
}

/**
 * Delete all keys matching a pattern
 * 
 * @param {string} pattern - Key pattern (e.g., 'exam:*')
 * @returns {Promise<number>} Number of keys deleted
 */
async function delPattern(pattern) {
  try {
    if (isRedisAvailable && redis) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        return keys.length;
      }
      return 0;
    } else {
      // In-memory fallback - convert pattern to regex
      const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
      let count = 0;
      for (const key of memoryCache.keys()) {
        if (regex.test(key)) {
          memoryCache.delete(key);
          count++;
        }
      }
      return count;
    }
  } catch (error) {
    console.error('[CacheService] Error deleting pattern from cache:', error);
    return 0;
  }
}

/**
 * Check if value exists in cache
 * 
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} True if exists
 */
async function exists(key) {
  try {
    if (isRedisAvailable && redis) {
      return await redis.exists(key) === 1;
    } else {
      const cached = memoryCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return true;
      } else if (cached) {
        memoryCache.delete(key);
      }
      return false;
    }
  } catch (error) {
    console.error('[CacheService] Error checking cache existence:', error);
    return false;
  }
}

/**
 * Clear all cache entries
 * 
 * @returns {Promise<boolean>} Success status
 */
async function clear() {
  try {
    if (isRedisAvailable && redis) {
      await redis.flushdb();
      return true;
    } else {
      memoryCache.clear();
      return true;
    }
  } catch (error) {
    console.error('[CacheService] Error clearing cache:', error);
    return false;
  }
}

/**
 * Get cache statistics
 * 
 * @returns {Promise<object>} Cache statistics
 */
async function getStats() {
  try {
    if (isRedisAvailable && redis) {
      const info = await redis.info('stats');
      return {
        type: 'redis',
        available: true,
        info
      };
    } else {
      return {
        type: 'memory',
        available: true,
        size: memoryCache.size,
        keys: Array.from(memoryCache.keys())
      };
    }
  } catch (error) {
    console.error('[CacheService] Error getting cache stats:', error);
    return {
      type: isRedisAvailable ? 'redis' : 'memory',
      available: false,
      error: error.message
    };
  }
}

/**
 * Cleanup expired entries from in-memory cache
 * Called periodically to prevent memory leaks
 */
function cleanupMemoryCache() {
  const now = Date.now();
  for (const [key, cached] of memoryCache.entries()) {
    if (cached.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }
}

// Run cleanup every 5 minutes for in-memory cache
setInterval(cleanupMemoryCache, 5 * 60 * 1000);

/**
 * Close Redis connection
 */
async function close() {
  if (redis) {
    await redis.quit();
    console.log('[CacheService] Redis connection closed');
  }
}

module.exports = {
  initializeCache,
  get,
  set,
  del,
  delPattern,
  exists,
  clear,
  getStats,
  close,
  isRedisAvailable: () => isRedisAvailable
};
