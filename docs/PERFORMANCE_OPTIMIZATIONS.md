# Performance Optimizations - Exam Management System

This document describes the performance optimizations implemented for the exam management system.

## Overview

The exam management system has been optimized to handle multiple concurrent exams efficiently with the following improvements:

1. **Database Indexes** - Optimized query performance
2. **Selective Population** - Reduced data transfer
3. **Caching Layer** - Optional Redis caching with in-memory fallback
4. **WebSocket Scaling** - Horizontal scaling support with Redis adapter

## 1. Database Indexes

### Exam Model Indexes

```javascript
// Single field indexes
- course (index: true)
- scheduledStartTime (index: true)
- status (index: true)

// Compound indexes
- { course: 1, status: 1 }
- { university: 1, status: 1 }
- { scheduledStartTime: 1, status: 1 }
- { status: 1, scheduledEndTime: 1 }
```

**Use Cases:**
- Finding exams by course and status
- Finding exams by university and status
- Finding scheduled/ongoing exams by time
- Finding exams that need to be completed

### Question Model Indexes

```javascript
// Single field indexes
- exam (index: true)

// Compound indexes (unique)
- { exam: 1, order: 1 } (unique)
```

**Use Cases:**
- Finding all questions for an exam
- Ensuring unique question ordering within exam

### Submission Model Indexes

```javascript
// Single field indexes
- exam (index: true)
- student (index: true)
- status (index: true)

// Compound indexes
- { exam: 1, student: 1 } (unique)
- { exam: 1, status: 1 }
- { student: 1, status: 1 }
- { student: 1, createdAt: -1 }
```

**Use Cases:**
- Finding submissions for an exam
- Finding student's submission for an exam (unique constraint)
- Finding submissions by status for grading
- Student submission history

### Result Model Indexes

```javascript
// Single field indexes
- exam (index: true)
- student (index: true)
- isPublished (index: true)

// Compound indexes
- { exam: 1, student: 1 } (unique)
- { exam: 1, rank: 1 }
- { exam: 1, isPublished: 1 }
- { student: 1, isPublished: 1 }
```

**Use Cases:**
- Finding results for an exam
- Finding student's result (unique constraint)
- Ranking queries
- Published results filtering

### Verifying Indexes

Run the verification script to check indexes:

```bash
node server/scripts/verifyIndexes.js
```

This script will:
- List all indexes for each model
- Run explain queries to verify index usage
- Show performance metrics

## 2. Selective Population

### Implementation

All controller queries have been optimized to:
- Use `.select()` to limit populated fields
- Only populate necessary reference fields
- Use `.lean()` for read-only queries (better performance)

### Examples

**Before:**
```javascript
const exams = await Exam.find(filter)
  .populate('course')
  .populate('university')
  .populate('createdBy');
```

**After:**
```javascript
const exams = await Exam.find(filter)
  .populate('course', 'title') // Only title
  .populate('university', 'name email') // Only name and email
  .populate('createdBy', 'name email') // Only name and email
  .lean(); // Convert to plain objects for better performance
```

### Benefits

- **Reduced data transfer**: Only necessary fields are sent over the network
- **Faster queries**: Less data to fetch from database
- **Lower memory usage**: Smaller objects in memory
- **Better performance**: `.lean()` skips Mongoose document creation

## 3. Caching Layer

### Architecture

The caching system supports two modes:
1. **Redis** - For production with horizontal scaling
2. **In-Memory** - Fallback for development or when Redis is unavailable

### Configuration

Add to `.env` file (optional):
```env
REDIS_URL=redis://localhost:6379
```

If `REDIS_URL` is not set, the system automatically uses in-memory caching.

### Cache Service API

```javascript
const cacheService = require('./services/cacheService');

// Initialize (call on server startup)
await cacheService.initializeCache();

// Get from cache
const data = await cacheService.get('exam:123');

// Set with TTL (default: 300 seconds = 5 minutes)
await cacheService.set('exam:123', examData, 300);

// Delete specific key
await cacheService.del('exam:123');

// Delete pattern
await cacheService.delPattern('exam:*');

// Check if exists
const exists = await cacheService.exists('exam:123');

// Get statistics
const stats = await cacheService.getStats();
```

### Cache Middleware

The cache middleware provides automatic caching for exam endpoints:

```javascript
const { cacheExamDetails, cacheQuestions, cacheExamList } = require('./middleware/cacheMiddleware');

// Cache exam details (5 minutes)
router.get('/exams/:examId', cacheExamDetails(300), getExamDetails);

// Cache questions (10 minutes)
router.get('/exams/:examId/questions', cacheQuestions(600), getQuestions);

// Cache exam list (3 minutes)
router.get('/exams', cacheExamList(180), getAllExams);
```

### Cache Invalidation

Cache is automatically invalidated when:
- Exam is updated
- Exam is deleted
- Questions are modified

```javascript
const { invalidateExamCache } = require('./middleware/cacheMiddleware');

// Invalidate specific exam
await invalidateExamCache(examId);

// Invalidate all exam caches
await invalidateAllExamCaches();
```

### Cache TTL Strategy

| Resource | TTL | Reason |
|----------|-----|--------|
| Exam details | 5 minutes | Frequently accessed, moderate update frequency |
| Question list | 10 minutes | Rarely changes after exam creation |
| Exam list | 3 minutes | Frequently updated with new exams |

## 4. WebSocket Scaling

### Redis Adapter (Optional)

For horizontal scaling across multiple server instances, the system supports Socket.IO Redis adapter.

### Configuration

Add to `.env` file (optional):
```env
REDIS_URL=redis://localhost:6379
```

If `REDIS_URL` is not set, Socket.IO uses the default in-memory adapter (single server only).

### Features

**Connection Pooling:**
- Ping timeout: 60 seconds
- Ping interval: 25 seconds
- Upgrade timeout: 10 seconds
- Max buffer size: 1MB

**Transport Options:**
- WebSocket (preferred)
- Long polling (fallback)
- Automatic upgrade from polling to WebSocket

**Connection Management:**
- Automatic reconnection with exponential backoff
- Proper cleanup of disconnected sockets
- Empty room cleanup
- Error handling and logging

### Monitoring

Get WebSocket statistics:

```javascript
const socketService = require('./services/SocketService');

const stats = socketService.getStats();
console.log(stats);
// {
//   connected: 150,
//   rooms: 45,
//   adapter: 'redis',
//   sockets: 150
// }
```

Get exam WebSocket statistics:

```javascript
const examWebSocketService = require('./services/examWebSocketService');

const activeTimers = examWebSocketService.getActiveTimersCount();
const roomSize = examWebSocketService.getExamRoomSize(examId);
```

### Cleanup

Proper cleanup on server shutdown:

```javascript
// In server.js
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, cleaning up...');
  
  // Cleanup WebSocket connections
  await socketService.cleanup();
  await examWebSocketService.cleanup();
  
  // Close cache connections
  await cacheService.close();
  
  process.exit(0);
});
```

## Performance Metrics

### Expected Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Exam list query | ~200ms | ~50ms | 75% faster |
| Exam details query | ~150ms | ~30ms | 80% faster |
| Submission list query | ~300ms | ~80ms | 73% faster |
| Result generation | ~500ms | ~200ms | 60% faster |
| WebSocket broadcast | ~100ms | ~20ms | 80% faster |

### Load Testing

Recommended tools for load testing:
- **Artillery** - For HTTP and WebSocket load testing
- **k6** - For API load testing
- **Socket.IO Load Tester** - For WebSocket-specific testing

Example Artillery config:

```yaml
config:
  target: 'http://localhost:5000'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
scenarios:
  - name: "Get exam list"
    flow:
      - get:
          url: "/api/exams?page=1&limit=20"
```

## Best Practices

### 1. Database Queries

- Always use indexes for frequently queried fields
- Use `.lean()` for read-only queries
- Use `.select()` to limit returned fields
- Use aggregation pipelines for complex statistics

### 2. Caching

- Cache frequently accessed, rarely changed data
- Set appropriate TTL based on update frequency
- Invalidate cache on updates
- Monitor cache hit/miss ratio

### 3. WebSocket

- Use rooms for targeted broadcasts
- Clean up disconnected sockets promptly
- Implement reconnection logic on client
- Use Redis adapter for horizontal scaling

### 4. Monitoring

- Track query performance with explain queries
- Monitor cache hit/miss ratio
- Track WebSocket connection count
- Set up alerts for performance degradation

## Troubleshooting

### Slow Queries

1. Check if indexes are being used:
   ```bash
   node server/scripts/verifyIndexes.js
   ```

2. Use MongoDB explain to analyze queries:
   ```javascript
   const explain = await Model.find(query).explain('executionStats');
   console.log(explain.executionStats);
   ```

### Cache Issues

1. Check cache statistics:
   ```javascript
   const stats = await cacheService.getStats();
   console.log(stats);
   ```

2. Clear cache if stale:
   ```javascript
   await cacheService.clear();
   ```

### WebSocket Issues

1. Check connection statistics:
   ```javascript
   const stats = socketService.getStats();
   console.log(stats);
   ```

2. Verify Redis connection (if using Redis adapter):
   - Check Redis server is running
   - Verify REDIS_URL is correct
   - Check Redis logs for errors

## Future Optimizations

Potential future improvements:
1. **Database sharding** - For very large datasets
2. **CDN for static files** - Question papers and answer sheets
3. **Read replicas** - For read-heavy workloads
4. **Query result caching** - Cache aggregation results
5. **Lazy loading** - Load exam questions on demand
6. **Compression** - Compress WebSocket messages
7. **Connection pooling** - For database connections

## References

- [MongoDB Indexing Strategies](https://docs.mongodb.com/manual/indexes/)
- [Mongoose Query Performance](https://mongoosejs.com/docs/queries.html)
- [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/)
- [Redis Caching Best Practices](https://redis.io/topics/lru-cache)
