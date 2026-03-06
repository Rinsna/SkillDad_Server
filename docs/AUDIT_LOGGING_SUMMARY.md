# Audit Logging Implementation Summary

## Overview

Comprehensive audit logging has been implemented for all critical exam-related operations in the Exam Management System. All audit events are logged to the `AuditLog` collection with user ID, action type, resource information, IP address, and user agent.

## Audit Log Service

**Location**: `server/services/auditLogService.js`

**Key Functions**:
- `logAuditEvent()` - Create audit log entry
- `getUserAuditLogs()` - Get logs for specific user
- `getResourceAuditLogs()` - Get logs for specific resource
- `getAuditLogsByAction()` - Get logs by action type
- `getAuditStatistics()` - Get audit statistics

## Logged Operations

### 1. Exam CRUD Operations

**Location**: `server/controllers/examController.js`

| Action | Event | Details Logged |
|--------|-------|----------------|
| Create Exam | `exam_created` | Exam title, type, course, university, scheduled times |
| Update Exam | `exam_updated` | Exam title, updated fields |
| Delete Exam | `exam_deleted` | Exam title, deletion timestamp |

**Requirements**: 20.1

### 2. Question Paper Uploads

**Location**: `server/controllers/examController.js`

| Action | Event | Details Logged |
|--------|-------|----------------|
| Upload Question Paper | `question_paper_uploaded` | Exam title, file URL, file size |

**Requirements**: 20.2

### 3. Exam Access Attempts

**Location**: `server/controllers/examController.js`

| Action | Event | Details Logged |
|--------|-------|----------------|
| Access Granted | `exam_access_granted` | Exam title, student ID, access reason, time remaining |
| Access Denied | `exam_access_denied` | Exam title, student ID, denial reason |

**Requirements**: 20.3

### 4. Exam Start Events

**Location**: `server/controllers/examController.js`

| Action | Event | Details Logged |
|--------|-------|----------------|
| Start Exam | `exam_started` | Exam title, student ID, start timestamp, submission ID |

**Requirements**: 20.4

### 5. Submission Events

**Location**: `server/controllers/examSubmissionController.js`

| Action | Event | Details Logged |
|--------|-------|----------------|
| Manual Submission | `exam_submitted_manual` | Exam title, student ID, submission timestamp, time spent |
| Auto Submission | `exam_submitted_auto` | Exam title, student ID, submission timestamp, time spent |
| Answer Sheet Upload | `answer_sheet_uploaded` | Exam title, student ID, file URL, file size |

**Requirements**: 20.5

### 6. Grading Actions

**Location**: `server/controllers/examSubmissionController.js`

| Action | Event | Details Logged |
|--------|-------|----------------|
| Manual Grading | `submission_graded` | Exam title, student ID, grader ID, marks awarded, percentage |
| Auto Grading | `exam_auto_graded` | Exam title, graded count, total submissions |

**Requirements**: 20.6

### 7. Result Publication

**Location**: `server/controllers/resultController.js`

| Action | Event | Details Logged |
|--------|-------|----------------|
| Publish Results | `results_published` | Exam title, published count, publication timestamp |

**Requirements**: 20.7

## Audit Log Model

**Location**: `server/models/auditLogModel.js`

**Schema Fields**:
```javascript
{
  userId: ObjectId,           // User performing the action
  action: String,             // Action type (enum)
  resource: String,           // Resource type (exam, submission, result, etc.)
  resourceId: ObjectId,       // ID of the resource
  details: Object,            // Additional action-specific details
  ipAddress: String,          // IP address of the request
  userAgent: String,          // User agent string
  createdAt: Date            // Timestamp (auto-generated)
}
```

**Indexes**:
- `userId` - For user-specific queries
- `resource + resourceId` - For resource-specific queries
- `action` - For action-type queries
- `createdAt` - For time-based queries

## Action Types

The following action types are logged:

1. **Exam Management**:
   - `exam_created`
   - `exam_updated`
   - `exam_deleted`
   - `question_paper_uploaded`

2. **Exam Access**:
   - `exam_access_granted`
   - `exam_access_denied`
   - `exam_started`

3. **Submissions**:
   - `exam_submitted_manual`
   - `exam_submitted_auto`
   - `answer_sheet_uploaded`
   - `answer_changed` (from exam integrity service)

4. **Grading**:
   - `submission_graded`
   - `exam_auto_graded`

5. **Results**:
   - `results_published`

## Usage Examples

### Query User's Audit Trail
```javascript
const auditLogService = require('./services/auditLogService');

// Get all actions by a specific user
const userLogs = await auditLogService.getUserAuditLogs(userId, {
  limit: 100,
  skip: 0,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31')
});
```

### Query Resource Audit Trail
```javascript
// Get all actions on a specific exam
const examLogs = await auditLogService.getResourceAuditLogs('exam', examId, {
  limit: 50
});
```

### Query by Action Type
```javascript
// Get all exam access attempts
const accessLogs = await auditLogService.getAuditLogsByAction('exam_access_granted', {
  startDate: new Date('2024-01-01')
});
```

### Get Audit Statistics
```javascript
// Get statistics for a time period
const stats = await auditLogService.getAuditStatistics({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31')
});

console.log(stats);
// {
//   totalLogs: 1523,
//   actionBreakdown: [
//     { _id: 'exam_started', count: 456 },
//     { _id: 'exam_submitted_manual', count: 423 },
//     { _id: 'exam_access_granted', count: 478 },
//     ...
//   ]
// }
```

## Security Considerations

1. **IP Address Logging**: All audit events include the IP address of the request for security analysis
2. **User Agent Logging**: User agent strings are logged to detect automated/bot activity
3. **Non-Blocking**: Audit logging failures do not break main functionality (errors are logged but not thrown)
4. **Indexed Queries**: All common query patterns are indexed for performance
5. **Immutable**: Audit logs cannot be modified or deleted through the API (database-level protection recommended)

## Compliance

This audit logging implementation satisfies:
- **Requirement 20.1**: Exam CRUD operations logged
- **Requirement 20.2**: Question paper uploads logged
- **Requirement 20.3**: Exam access attempts logged
- **Requirement 20.4**: Exam start events logged
- **Requirement 20.5**: Submission events logged
- **Requirement 20.6**: Grading actions logged
- **Requirement 20.7**: Result publication logged
- **Requirement 20.8**: IP address and user agent included

## Monitoring and Analysis

### Suspicious Activity Detection

The audit logs can be used to detect suspicious patterns:

1. **Multiple Failed Access Attempts**: Query `exam_access_denied` events for the same user/exam
2. **Rapid Submissions**: Query submission events with short time intervals
3. **Unusual Access Patterns**: Query access events from unusual IP addresses or user agents
4. **Bulk Operations**: Query for high-frequency actions from a single user

### Compliance Reporting

Generate compliance reports using the audit statistics:

```javascript
// Monthly activity report
const monthlyStats = await auditLogService.getAuditStatistics({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
});

// User activity report
const userActivity = await auditLogService.getUserAuditLogs(userId, {
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31')
});
```

## Future Enhancements

1. **Audit Log Retention Policy**: Implement automatic archival of old logs
2. **Real-time Alerts**: Set up alerts for suspicious patterns
3. **Audit Log API**: Create admin endpoints to query audit logs
4. **Export Functionality**: Add ability to export audit logs for compliance
5. **Audit Log Visualization**: Create dashboard for audit log analysis

## Conclusion

All critical exam-related operations are now comprehensively logged with full audit trails. The system provides complete visibility into user actions for security analysis, compliance reporting, and issue investigation.
