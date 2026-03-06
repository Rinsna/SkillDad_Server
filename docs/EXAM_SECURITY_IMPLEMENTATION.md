# Exam Security Implementation Guide

This document provides instructions for applying the security measures implemented in Task 25 to the exam management system routes.

## Overview

The following security measures have been implemented:

1. **Input Validation and Sanitization** - Using express-validator and DOMPurify
2. **Rate Limiting** - Using express-rate-limit with Redis support
3. **Enhanced File Upload Security** - MIME type validation, file signature checking, randomized filenames
4. **Exam Integrity Measures** - Question shuffling, MCQ option randomization, answer change tracking

## 1. Input Validation and Sanitization

### Location
`server/middleware/examValidation.js`

### Available Validators

- `validateExamSchedule` - For exam creation/scheduling
- `validateQuestion` - For question creation
- `validateAnswerSubmission` - For answer submissions
- `validateGrading` - For grading submissions
- `validateObjectId(paramName)` - For MongoDB ObjectId validation
- `validatePagination` - For pagination parameters

### How to Apply

Add validation middleware to routes in `server/routes/examRoutes.js`:

```javascript
const {
  validateExamSchedule,
  validateQuestion,
  validateAnswerSubmission,
  validateGrading,
  validateObjectId,
  validatePagination
} = require('../middleware/examValidation');

// Example: Apply to exam scheduling route
router.post('/exams', 
  protect, 
  authorize('admin'), 
  validateExamSchedule,  // Add this
  scheduleExam
);

// Example: Apply to question creation
router.post('/exams/:examId/questions',
  protect,
  authorize('university', 'admin'),
  validateObjectId('examId'),  // Add this
  validateQuestion,  // Add this
  createQuestions
);

// Example: Apply to answer submission
router.post('/exam-submissions/:submissionId/answer',
  protect,
  authorize('student'),
  validateObjectId('submissionId'),  // Add this
  validateAnswerSubmission,  // Add this
  submitAnswer
);

// Example: Apply to grading
router.post('/exam-submissions/:submissionId/grade',
  protect,
  authorize('university', 'admin'),
  validateObjectId('submissionId'),  // Add this
  validateGrading,  // Add this
  gradeSubmission
);

// Example: Apply to pagination
router.get('/exams',
  protect,
  authorize('admin'),
  validatePagination,  // Add this
  getAllExams
);
```

### Features

- **HTML Sanitization**: Automatically sanitizes HTML in question text, descriptions, feedback, and instructions
- **Date Validation**: Ensures date ranges are logical (end time after start time, etc.)
- **Type Validation**: Validates enum values, MongoDB ObjectIds, integers, booleans
- **Length Limits**: Enforces maximum character limits on text fields
- **Custom Validation**: Validates business logic (duration fits in time window, etc.)

## 2. Rate Limiting

### Location
`server/middleware/examRateLimiter.js`

### Available Rate Limiters

- `generalApiLimiter` - 100 requests per 15 minutes
- `fileUploadLimiter` - 10 uploads per hour
- `examStartLimiter` - 3 attempts per exam per day
- `answerSubmissionLimiter` - 60 submissions per minute
- `resultViewLimiter` - 30 requests per 5 minutes
- `gradingLimiter` - 50 operations per hour
- `examCreationLimiter` - 20 exams per hour
- `questionCreationLimiter` - 100 questions per hour

### How to Apply

Add rate limiting middleware to routes:

```javascript
const {
  generalApiLimiter,
  fileUploadLimiter,
  examStartLimiter,
  answerSubmissionLimiter,
  resultViewLimiter,
  gradingLimiter,
  examCreationLimiter,
  questionCreationLimiter
} = require('../middleware/examRateLimiter');

// Apply general rate limiter to all exam routes
router.use('/exams', generalApiLimiter);

// Apply specific rate limiters to specific routes
router.post('/exams', 
  protect, 
  authorize('admin'),
  examCreationLimiter,  // Add this
  validateExamSchedule,
  scheduleExam
);

router.post('/exams/:examId/question-paper',
  protect,
  authorize('university', 'admin'),
  fileUploadLimiter,  // Add this
  upload.single('file'),
  uploadQuestionPaper
);

router.post('/exams/:examId/start',
  protect,
  authorize('student'),
  examStartLimiter,  // Add this
  startExam
);

router.post('/exam-submissions/:submissionId/answer',
  protect,
  authorize('student'),
  answerSubmissionLimiter,  // Add this
  validateAnswerSubmission,
  submitAnswer
);

router.post('/exam-submissions/:submissionId/grade',
  protect,
  authorize('university', 'admin'),
  gradingLimiter,  // Add this
  validateGrading,
  gradeSubmission
);

router.get('/results/exam/:examId',
  protect,
  resultViewLimiter,  // Add this
  getExamResults
);
```

### Features

- **Redis Support**: Uses Redis for distributed rate limiting if available, falls back to memory store
- **User-based Limiting**: Tracks limits per user ID for authenticated requests
- **IP-based Limiting**: Falls back to IP-based limiting for unauthenticated requests
- **Admin Exemption**: Admin users are exempt from most rate limits
- **Custom Key Generation**: Exam start limiter uses exam-specific keys
- **Standard Headers**: Returns `Retry-After` header when limit exceeded

### Configuration

Set Redis URL in environment variables for distributed rate limiting:

```env
REDIS_URL=redis://localhost:6379
```

## 3. Enhanced File Upload Security

### Location
`server/services/fileUploadService.js`

### Security Features Implemented

1. **MIME Type Validation**: Validates file MIME type matches expected format
2. **File Extension Validation**: Checks file extension against whitelist
3. **File Size Limits**: Enforces maximum file sizes (10MB for question papers, 20MB for answer sheets)
4. **Minimum File Size**: Prevents empty or suspiciously small files
5. **File Signature Validation**: Validates magic numbers for PDFs and images
6. **Suspicious Filename Detection**: Blocks path traversal and malicious filenames
7. **Randomized Filenames**: Generates secure random filenames to prevent path traversal
8. **Signed URLs**: Generates time-limited signed URLs for file access

### File Signature Validation

The service validates file signatures (magic numbers) to ensure files are actually what they claim to be:

- **PDF**: Checks for `%PDF-` signature (0x25 0x50 0x44 0x46 0x2D)
- **JPEG**: Checks for JPEG signature (0xFF 0xD8 0xFF)
- **PNG**: Checks for PNG signature (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)

### How to Use

The file upload service is already integrated into the exam controllers. No additional changes needed.

### Configuration

Configure file storage in `server/config/fileStorage.js`:

```javascript
module.exports = {
  type: process.env.FILE_STORAGE_TYPE || 'local', // 'local' or 's3'
  
  local: {
    baseDir: process.env.FILE_STORAGE_PATH || './uploads/exams'
  },
  
  s3: {
    bucket: process.env.AWS_S3_BUCKET,
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  
  limits: {
    questionPaper: {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['application/pdf'],
      allowedExtensions: ['.pdf']
    },
    answerSheet: {
      maxSize: 20 * 1024 * 1024, // 20MB
      allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png']
    }
  }
};
```

## 4. Exam Integrity Measures

### Location
`server/services/examIntegrityService.js`

### Features Implemented

1. **Question Shuffling**: Randomizes question order if configured
2. **MCQ Option Randomization**: Randomizes option order for each MCQ question
3. **Answer Change Tracking**: Logs all answer changes with timestamps
4. **Submission Integrity Validation**: Validates submission is within time window
5. **Suspicious Activity Detection**: Detects rapid changes, excessive changes, and fast completion
6. **Exam Access Statistics**: Tracks access attempts for monitoring

### How to Use

The exam integrity service is already integrated into:

- `examController.js` - `startExam()` function uses `processQuestionsForDelivery()`
- `examSubmissionController.js` - `submitAnswer()` function uses `logAnswerChange()` and `trackAnswerChange()`

### Answer Change Tracking

Answer changes are tracked in two ways:

1. **Audit Logs**: Detailed logs in the audit log system
2. **Submission Document**: Changes stored in `submission.answerChanges` array

### Suspicious Activity Detection

The service can detect:

- **Excessive Changes**: More than 5 changes to a single question
- **Rapid Changes**: Consecutive changes less than 2 seconds apart
- **Fast Completion**: Exam completed faster than 30 seconds per question

### How to Monitor

Use the exam integrity service to get statistics:

```javascript
const examIntegrityService = require('../services/examIntegrityService');

// Get exam access statistics
const stats = await examIntegrityService.getExamAccessStats(examId);
console.log(stats);
// {
//   accessGranted: 45,
//   accessDenied: 3,
//   examStarted: 42,
//   totalAttempts: 48
// }

// Detect suspicious activity in a submission
const flags = examIntegrityService.detectSuspiciousActivity(submission);
if (flags.length > 0) {
  console.log('Suspicious activity detected:', flags);
}
```

## Complete Route Example

Here's a complete example of applying all security measures to exam routes:

```javascript
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Import validation middleware
const {
  validateExamSchedule,
  validateQuestion,
  validateAnswerSubmission,
  validateGrading,
  validateObjectId,
  validatePagination
} = require('../middleware/examValidation');

// Import rate limiting middleware
const {
  generalApiLimiter,
  fileUploadLimiter,
  examStartLimiter,
  answerSubmissionLimiter,
  resultViewLimiter,
  gradingLimiter,
  examCreationLimiter,
  questionCreationLimiter
} = require('../middleware/examRateLimiter');

// Import controllers
const {
  scheduleExam,
  updateExam,
  deleteExam,
  getAllExams,
  uploadQuestionPaper,
  getQuestionPaperDownloadUrl,
  uploadAnswerSheet,
  getAnswerSheetDownloadUrl,
  deleteExamFiles,
  getStudentExams,
  checkExamAccessController,
  startExam,
  autoGradeExam
} = require('../controllers/examController');

const {
  submitAnswer,
  uploadAnswerSheet,
  submitExam,
  getMySubmission,
  getSubmissionsForExam,
  gradeSubmission,
  getExamResults,
  getStudentResult
} = require('../controllers/examSubmissionController');

// Apply general rate limiter to all routes
router.use(generalApiLimiter);

// Admin routes
router.post('/exams',
  protect,
  authorize('admin'),
  examCreationLimiter,
  validateExamSchedule,
  scheduleExam
);

router.put('/exams/:examId',
  protect,
  authorize('admin'),
  validateObjectId('examId'),
  validateExamSchedule,
  updateExam
);

router.delete('/exams/:examId',
  protect,
  authorize('admin'),
  validateObjectId('examId'),
  deleteExam
);

router.get('/exams',
  protect,
  authorize('admin'),
  validatePagination,
  getAllExams
);

// University routes
router.post('/exams/:examId/question-paper',
  protect,
  authorize('university', 'admin'),
  fileUploadLimiter,
  validateObjectId('examId'),
  upload.single('file'),
  uploadQuestionPaper
);

router.post('/exams/:examId/questions',
  protect,
  authorize('university', 'admin'),
  questionCreationLimiter,
  validateObjectId('examId'),
  validateQuestion,
  createQuestions
);

router.post('/exam-submissions/:submissionId/grade',
  protect,
  authorize('university', 'admin'),
  gradingLimiter,
  validateObjectId('submissionId'),
  validateGrading,
  gradeSubmission
);

// Student routes
router.get('/exams/student/my-exams',
  protect,
  authorize('student'),
  getStudentExams
);

router.get('/exams/:examId/access',
  protect,
  authorize('student'),
  validateObjectId('examId'),
  checkExamAccessController
);

router.post('/exams/:examId/start',
  protect,
  authorize('student'),
  examStartLimiter,
  validateObjectId('examId'),
  startExam
);

router.post('/exam-submissions/:submissionId/answer',
  protect,
  authorize('student'),
  answerSubmissionLimiter,
  validateObjectId('submissionId'),
  validateAnswerSubmission,
  submitAnswer
);

router.post('/exam-submissions/:submissionId/answer-sheet',
  protect,
  authorize('student'),
  fileUploadLimiter,
  validateObjectId('submissionId'),
  upload.single('file'),
  uploadAnswerSheet
);

router.post('/exam-submissions/:submissionId/submit',
  protect,
  authorize('student'),
  validateObjectId('submissionId'),
  submitExam
);

// Result routes
router.get('/results/exam/:examId',
  protect,
  resultViewLimiter,
  validateObjectId('examId'),
  getExamResults
);

router.get('/results/exam/:examId/student/:studentId',
  protect,
  resultViewLimiter,
  validateObjectId('examId'),
  validateObjectId('studentId'),
  getStudentResult
);

module.exports = router;
```

## Testing Security Measures

### 1. Test Input Validation

```bash
# Test invalid exam type
curl -X POST http://localhost:5000/api/exams \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Exam",
    "examType": "invalid-type",
    ...
  }'
# Expected: 400 Bad Request with validation error

# Test XSS in question text
curl -X POST http://localhost:5000/api/exams/:examId/questions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "questionText": "<script>alert(\"XSS\")</script>What is 2+2?",
    ...
  }'
# Expected: HTML tags sanitized in response
```

### 2. Test Rate Limiting

```bash
# Test file upload rate limit (10 per hour)
for i in {1..11}; do
  curl -X POST http://localhost:5000/api/exams/:examId/question-paper \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@test.pdf"
done
# Expected: 11th request returns 429 Too Many Requests
```

### 3. Test File Upload Security

```bash
# Test invalid file type
curl -X POST http://localhost:5000/api/exams/:examId/question-paper \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@malicious.exe"
# Expected: 400 Bad Request - Invalid file type

# Test file with wrong extension
curl -X POST http://localhost:5000/api/exams/:examId/question-paper \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@fake.pdf"  # Actually a .txt file renamed to .pdf
# Expected: 400 Bad Request - File signature validation failed
```

### 4. Test Exam Integrity

```bash
# Start exam and verify questions are shuffled
curl -X POST http://localhost:5000/api/exams/:examId/start \
  -H "Authorization: Bearer $TOKEN"
# Expected: Questions in random order if shuffleQuestions=true

# Submit multiple answer changes
curl -X POST http://localhost:5000/api/exam-submissions/:submissionId/answer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"questionId": "...", "selectedOption": 0}'
# Expected: Answer change logged in audit logs and submission.answerChanges
```

## Monitoring and Logging

All security events are logged using the audit log service:

- Exam creation, updates, deletions
- Question paper uploads
- Exam access attempts (granted/denied)
- Exam starts
- Answer changes
- Answer sheet uploads
- Grading operations
- Result publications

View audit logs:

```javascript
const auditLogService = require('./services/auditLogService');

// Get all exam-related audit logs
const logs = await auditLogService.getAuditLogs({
  resource: 'exam',
  resourceId: examId
});

// Get answer change logs
const answerChanges = await auditLogService.getAuditLogs({
  action: 'answer_changed',
  userId: studentId
});
```

## Security Best Practices

1. **Always validate input** - Use validation middleware on all routes
2. **Apply rate limiting** - Prevent abuse and DoS attacks
3. **Validate file signatures** - Don't trust MIME types alone
4. **Use signed URLs** - Time-limit file access
5. **Track changes** - Log all critical operations
6. **Monitor suspicious activity** - Review answer change patterns
7. **Keep dependencies updated** - Regularly update security packages
8. **Use HTTPS** - Always use HTTPS in production
9. **Sanitize HTML** - Prevent XSS attacks
10. **Implement CSRF protection** - Use CSRF tokens for state-changing operations

## Environment Variables

Add these to your `.env` file:

```env
# Redis for rate limiting (optional)
REDIS_URL=redis://localhost:6379

# File storage
FILE_STORAGE_TYPE=local  # or 's3'
FILE_STORAGE_PATH=./uploads/exams

# AWS S3 (if using S3 storage)
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Conclusion

All security measures have been implemented and are ready to be applied to the exam routes. Follow the examples in this guide to integrate them into your route definitions.

For questions or issues, refer to the individual service files or contact the development team.
