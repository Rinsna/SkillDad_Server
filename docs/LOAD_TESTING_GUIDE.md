# Load Testing Guide - Exam Management System

## Overview

This guide provides instructions for performing load testing on the Exam Management System to ensure it can handle multiple concurrent users during peak exam times.

## Load Testing Objectives

1. **Concurrent Exam Taking**: Test 50-100 students taking exams simultaneously
2. **WebSocket Scalability**: Verify WebSocket connections handle multiple concurrent users
3. **File Upload Performance**: Test multiple simultaneous file uploads
4. **Database Performance**: Ensure queries remain fast under load
5. **Auto-Submission Performance**: Test mass auto-submission when exams expire

## Recommended Tools

### 1. Artillery (Recommended)
- Easy to configure
- Supports HTTP and WebSocket
- Built-in reporting

### 2. k6
- Modern load testing tool
- JavaScript-based scenarios
- Excellent reporting

### 3. Apache JMeter
- Comprehensive testing tool
- GUI and CLI modes
- Extensive plugin ecosystem

## Load Testing Scenarios

### Scenario 1: Concurrent Exam Access

**Objective**: Test 100 students accessing exam list simultaneously

**Artillery Configuration** (`load-tests/exam-access.yml`):

```yaml
config:
  target: "http://localhost:5000"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
    - duration: 60
      arrivalRate: 100
      name: "Peak load"
  processor: "./auth-processor.js"

scenarios:
  - name: "Student accesses exam list"
    flow:
      - function: "generateStudentToken"
      - get:
          url: "/api/exams/student/my-exams"
          headers:
            Authorization: "Bearer {{ token }}"
```

**Expected Results**:
- Response time < 500ms for 95% of requests
- No 500 errors
- No connection timeouts

### Scenario 2: Concurrent Exam Starting

**Objective**: Test 50 students starting the same exam simultaneously

**Artillery Configuration** (`load-tests/exam-start.yml`):

```yaml
config:
  target: "http://localhost:5000"
  phases:
    - duration: 10
      arrivalRate: 50
      name: "Mass exam start"
  processor: "./auth-processor.js"

scenarios:
  - name: "Student starts exam"
    flow:
      - function: "generateStudentToken"
      - post:
          url: "/api/exams/{{ examId }}/start"
          headers:
            Authorization: "Bearer {{ token }}"
          json:
            examId: "{{ examId }}"
```

**Expected Results**:
- All 50 students can start exam
- Response time < 1000ms
- WebSocket connections established
- No duplicate submissions created

### Scenario 3: Concurrent Answer Submissions

**Objective**: Test rapid answer submissions from multiple students

**Artillery Configuration** (`load-tests/answer-submission.yml`):

```yaml
config:
  target: "http://localhost:5000"
  phases:
    - duration: 60
      arrivalRate: 30
      name: "Continuous answer submissions"
  processor: "./auth-processor.js"

scenarios:
  - name: "Student submits answers"
    flow:
      - function: "generateStudentToken"
      - loop:
        - post:
            url: "/api/exam-submissions/{{ submissionId }}/answer"
            headers:
              Authorization: "Bearer {{ token }}"
            json:
              questionId: "{{ questionId }}"
              selectedOption: 0
        count: 10
```

**Expected Results**:
- Response time < 300ms for 95% of requests
- All answers saved correctly
- No data loss
- Rate limiting enforced (60/min per user)

### Scenario 4: WebSocket Load Testing

**Objective**: Test 100 concurrent WebSocket connections

**Artillery Configuration** (`load-tests/websocket.yml`):

```yaml
config:
  target: "ws://localhost:5000"
  phases:
    - duration: 120
      arrivalRate: 10
      name: "Ramp up WebSocket connections"
  processor: "./websocket-processor.js"

scenarios:
  - engine: "ws"
    flow:
      - function: "generateStudentToken"
      - connect:
          url: "/"
          headers:
            Authorization: "Bearer {{ token }}"
      - emit:
          channel: "join-exam"
          data:
            examId: "{{ examId }}"
            studentId: "{{ studentId }}"
      - think: 120
```

**Expected Results**:
- All 100 connections established
- Timer updates received every minute
- No connection drops
- Memory usage stable

### Scenario 5: File Upload Load Testing

**Objective**: Test 20 concurrent file uploads

**Artillery Configuration** (`load-tests/file-upload.yml`):

```yaml
config:
  target: "http://localhost:5000"
  phases:
    - duration: 60
      arrivalRate: 2
      name: "File uploads"
  processor: "./file-upload-processor.js"

scenarios:
  - name: "Upload question paper"
    flow:
      - function: "generateUniversityToken"
      - post:
          url: "/api/exams/{{ examId }}/question-paper"
          headers:
            Authorization: "Bearer {{ token }}"
          formData:
            file: "@./test-files/sample.pdf"
```

**Expected Results**:
- All uploads complete successfully
- Response time < 5000ms
- Rate limiting enforced (10/hour per user)
- Files stored correctly

### Scenario 6: Mass Auto-Submission

**Objective**: Test auto-submission of 50 exams simultaneously

**Test Procedure**:
1. Create exam with 2-minute duration
2. Have 50 students start exam
3. Wait for exam to expire
4. Monitor auto-submission process

**Expected Results**:
- All 50 submissions auto-submitted within 10 seconds
- Auto-grading completes for all
- WebSocket events sent to all students
- No errors or timeouts

### Scenario 7: Result Publication Load

**Objective**: Test result publication for 100 students

**Test Procedure**:
1. Create exam with 100 submissions
2. Grade all submissions
3. Publish results
4. Monitor notification sending

**Expected Results**:
- Results published within 5 seconds
- All 100 notifications queued
- Database updates complete
- No errors

## Performance Benchmarks

### Response Time Targets

| Operation | Target (95th percentile) | Maximum |
|-----------|-------------------------|---------|
| Get exam list | 300ms | 500ms |
| Start exam | 800ms | 1500ms |
| Submit answer | 200ms | 400ms |
| Submit exam | 500ms | 1000ms |
| View result | 400ms | 800ms |
| Upload file | 3000ms | 5000ms |

### Throughput Targets

| Operation | Target (requests/second) |
|-----------|-------------------------|
| Answer submissions | 100 |
| Exam access checks | 50 |
| Result views | 30 |
| File uploads | 5 |

### Resource Limits

| Resource | Limit |
|----------|-------|
| WebSocket connections | 1000 concurrent |
| Database connections | 100 |
| Memory usage | < 2GB |
| CPU usage | < 80% |

## Running Load Tests

### Setup

1. Install Artillery:
```bash
npm install -g artillery
```

2. Create test data:
```bash
node scripts/create-test-data.js
```

3. Start server in production mode:
```bash
NODE_ENV=production npm start
```

### Execute Tests

```bash
# Run individual test
artillery run load-tests/exam-access.yml

# Run with custom target
artillery run --target http://staging.example.com load-tests/exam-access.yml

# Generate HTML report
artillery run --output report.json load-tests/exam-access.yml
artillery report report.json
```

### Monitor During Tests

1. **Server Metrics**:
```bash
# Monitor CPU and memory
htop

# Monitor Node.js process
pm2 monit
```

2. **Database Metrics**:
```bash
# MongoDB stats
mongo --eval "db.serverStatus()"

# Watch slow queries
mongo --eval "db.setProfilingLevel(2)"
```

3. **WebSocket Connections**:
```bash
# Check active connections
netstat -an | grep :5000 | wc -l
```

## Analyzing Results

### Key Metrics to Review

1. **Response Times**:
   - p50 (median)
   - p95 (95th percentile)
   - p99 (99th percentile)
   - max

2. **Error Rates**:
   - HTTP 4xx errors
   - HTTP 5xx errors
   - Timeout errors
   - Connection errors

3. **Throughput**:
   - Requests per second
   - Successful requests
   - Failed requests

4. **Resource Usage**:
   - CPU utilization
   - Memory usage
   - Database connections
   - WebSocket connections

### Sample Artillery Report

```
Summary report @ 14:30:15(+0000)
  Scenarios launched:  1000
  Scenarios completed: 1000
  Requests completed:  5000
  Mean response/sec: 83.33
  Response time (msec):
    min: 45
    max: 1234
    median: 156
    p95: 345
    p99: 678
  Scenario counts:
    Student accesses exam list: 1000 (100%)
  Codes:
    200: 4950
    429: 50
```

## Optimization Recommendations

### If Response Times Are High

1. **Add Database Indexes**:
```javascript
// Check missing indexes
db.exams.explain("executionStats").find({ status: "ongoing" })
```

2. **Enable Caching**:
```javascript
// Cache exam details
const cachedExam = await cache.get(`exam:${examId}`);
```

3. **Optimize Queries**:
```javascript
// Use lean() for read-only queries
const exams = await Exam.find().lean();

// Select only needed fields
const exams = await Exam.find().select('title status');
```

### If WebSocket Connections Drop

1. **Enable Redis Adapter**:
```javascript
const redisAdapter = require('@socket.io/redis-adapter');
io.adapter(redisAdapter({ host: 'localhost', port: 6379 }));
```

2. **Increase Connection Limits**:
```javascript
// In server.js
const io = new Server(server, {
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000
});
```

### If Database Is Slow

1. **Add Compound Indexes**:
```javascript
examSchema.index({ status: 1, scheduledStartTime: 1 });
submissionSchema.index({ exam: 1, status: 1 });
```

2. **Use Aggregation Pipelines**:
```javascript
const stats = await Submission.aggregate([
  { $match: { exam: examId } },
  { $group: { _id: null, avgMarks: { $avg: '$obtainedMarks' } } }
]);
```

3. **Enable Query Profiling**:
```javascript
// Find slow queries
db.setProfilingLevel(2);
db.system.profile.find().sort({ ts: -1 }).limit(10);
```

## Continuous Load Testing

### CI/CD Integration

Add load tests to CI/CD pipeline:

```yaml
# .github/workflows/load-test.yml
name: Load Tests
on:
  schedule:
    - cron: '0 2 * * *'  # Run daily at 2 AM

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install Artillery
        run: npm install -g artillery
      - name: Run load tests
        run: artillery run load-tests/exam-access.yml
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: load-test-results
          path: report.json
```

### Monitoring Alerts

Set up alerts for performance degradation:

```javascript
// Example: Alert if p95 response time > 1000ms
if (metrics.p95 > 1000) {
  sendAlert('High response times detected');
}
```

## Conclusion

Regular load testing ensures the Exam Management System can handle peak loads during exam periods. Run these tests before major releases and monitor production metrics to identify performance issues early.

For production deployment, consider:
- Horizontal scaling with load balancer
- Redis for WebSocket scaling
- Database read replicas
- CDN for static assets
- Caching layer (Redis/Memcached)
