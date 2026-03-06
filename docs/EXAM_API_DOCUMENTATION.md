# Exam Management System - API Documentation

## Overview

This document provides comprehensive API documentation for the Exam Management System. The system supports multiple exam formats (PDF-based, online MCQ, descriptive, mixed), real-time exam monitoring, automated grading, and role-based access control.

## Base URL

```
http://localhost:5000/api
```

## Authentication

All endpoints require JWT authentication via Bearer token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Role-Based Access

- **Admin**: Full access to all exam operations
- **University**: Can create exams, manage questions, grade submissions, publish results
- **Student**: Can view assigned exams, take exams, view published results

---

## Exam Management Endpoints

### 1. Schedule Exam (Admin)

Create a new exam with scheduling and configuration.

**Endpoint:** `POST /api/exams/admin/schedule`

**Access:** Admin only

**Request Body:**
```json
{
  "title": "Midterm Examination",
  "description": "Midterm exam covering chapters 1-5",
  "course": "60d5ec49f1b2c72b8c8e4a1b",
  "university": "60d5ec49f1b2c72b8c8e4a1c",
  "examType": "online-mcq",
  "scheduledStartTime": "2024-03-15T10:00:00Z",
  "scheduledEndTime": "2024-03-15T12:00:00Z",
  "duration": 120,
  "totalMarks": 100,
  "passingScore": 40,
  "isMockExam": false,
  "allowLateSubmission": false,
  "shuffleQuestions": true,
  "instructions": "Answer all questions. No negative marking."
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "_id": "60d5ec49f1b2c72b8c8e4a1d",
    "title": "Midterm Examination",
    "status": "scheduled",
    "scheduledStartTime": "2024-03-15T10:00:00Z",
    "scheduledEndTime": "2024-03-15T12:00:00Z",
    "duration": 120,
    "totalMarks": 100
  },
  "message": "Exam scheduled successfully. Notifications sent to enrolled students."
}
```

**Validation Rules:**
- `scheduledEndTime` must be after `scheduledStartTime`
- `duration` must fit within the time window
- `examType` must be one of: `pdf-based`, `online-mcq`, `online-descriptive`, `mixed`
- `totalMarks` must be positive
- `passingScore` must be between 0 and 100

---

### 2. Update Exam (Admin)

Update exam details before it starts.

**Endpoint:** `PUT /api/exams/admin/:examId`

**Access:** Admin only

**Request Body:** (partial update supported)
```json
{
  "title": "Updated Midterm Examination",
  "scheduledStartTime": "2024-03-15T11:00:00Z",
  "totalMarks": 120
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "60d5ec49f1b2c72b8c8e4a1d",
    "title": "Updated Midterm Examination",
    "scheduledStartTime": "2024-03-15T11:00:00Z",
    "totalMarks": 120
  }
}
```

---

### 3. Delete Exam (Admin)

Delete an exam and all associated data (questions, submissions, results).

**Endpoint:** `DELETE /api/exams/admin/:examId`

**Access:** Admin only

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Exam and all associated data deleted successfully"
}
```

---

### 4. Get All Exams (Admin)

Retrieve all exams with filtering and pagination.

**Endpoint:** `GET /api/exams/admin/all`

**Access:** Admin only

**Query Parameters:**
- `status` (optional): Filter by status (`scheduled`, `ongoing`, `completed`, `graded`, `published`)
- `university` (optional): Filter by university ID
- `course` (optional): Filter by course ID
- `isMockExam` (optional): Filter mock exams (`true`/`false`)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Example:** `GET /api/exams/admin/all?status=scheduled&page=1&limit=20`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "exams": [
      {
        "_id": "60d5ec49f1b2c72b8c8e4a1d",
        "title": "Midterm Examination",
        "status": "scheduled",
        "course": {
          "_id": "60d5ec49f1b2c72b8c8e4a1b",
          "title": "Introduction to Computer Science"
        },
        "scheduledStartTime": "2024-03-15T10:00:00Z",
        "totalMarks": 100
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalExams": 47,
      "limit": 10
    }
  }
}
```

---

### 5. Get Student Exams

Retrieve exams for courses the student is enrolled in.

**Endpoint:** `GET /api/exams/student/my-exams`

**Access:** Student only

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "_id": "60d5ec49f1b2c72b8c8e4a1d",
      "title": "Midterm Examination",
      "course": {
        "_id": "60d5ec49f1b2c72b8c8e4a1b",
        "title": "Introduction to Computer Science"
      },
      "status": "scheduled",
      "scheduledStartTime": "2024-03-15T10:00:00Z",
      "scheduledEndTime": "2024-03-15T12:00:00Z",
      "duration": 120,
      "totalMarks": 100,
      "examType": "online-mcq"
    }
  ]
}
```

---

### 6. Check Exam Access

Verify if a student can access an exam based on time window and enrollment.

**Endpoint:** `GET /api/exams/:examId/access`

**Access:** Student only

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "canAccess": true,
    "reason": "Access granted",
    "timeRemaining": 7200,
    "exam": {
      "_id": "60d5ec49f1b2c72b8c8e4a1d",
      "title": "Midterm Examination",
      "duration": 120
    }
  }
}
```

**Access Denied Response:** `403 Forbidden`
```json
{
  "success": false,
  "data": {
    "canAccess": false,
    "reason": "Exam has not started yet",
    "timeUntilStart": 3600
  }
}
```

---

### 7. Start Exam

Start taking an exam (creates submission record).

**Endpoint:** `POST /api/exams/:examId/start`

**Access:** Student only

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "submission": {
      "_id": "60d5ec49f1b2c72b8c8e4a1e",
      "exam": "60d5ec49f1b2c72b8c8e4a1d",
      "student": "60d5ec49f1b2c72b8c8e4a1f",
      "startedAt": "2024-03-15T10:05:00Z",
      "status": "in-progress"
    },
    "questions": [
      {
        "_id": "60d5ec49f1b2c72b8c8e4a20",
        "questionText": "What is the capital of France?",
        "questionType": "mcq",
        "options": [
          { "text": "London", "isCorrect": false },
          { "text": "Paris", "isCorrect": true },
          { "text": "Berlin", "isCorrect": false },
          { "text": "Madrid", "isCorrect": false }
        ],
        "marks": 5,
        "order": 1
      }
    ],
    "timeRemaining": 7200
  }
}
```

---

## Question Management Endpoints

### 8. Upload Question Paper (University)

Upload PDF question paper for PDF-based exams.

**Endpoint:** `POST /api/exams/:examId/question-paper`

**Access:** University/Admin

**Content-Type:** `multipart/form-data`

**Request Body:**
```
questionPaper: <PDF file>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "questionPaperUrl": "https://storage.example.com/exams/question-papers/abc123.pdf"
  },
  "message": "Question paper uploaded successfully"
}
```

**Validation:**
- File must be PDF format
- File size must not exceed 10MB

---

### 9. Create Online Questions (University)

Create MCQ or descriptive questions for online exams.

**Endpoint:** `POST /api/exams/:examId/questions`

**Access:** University/Admin

**Request Body:**
```json
{
  "questions": [
    {
      "questionType": "mcq",
      "questionText": "What is 2 + 2?",
      "options": [
        { "text": "3", "isCorrect": false },
        { "text": "4", "isCorrect": true },
        { "text": "5", "isCorrect": false }
      ],
      "marks": 5,
      "negativeMarks": 1,
      "order": 1
    },
    {
      "questionType": "descriptive",
      "questionText": "Explain the concept of inheritance in OOP.",
      "marks": 10,
      "order": 2
    }
  ]
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "questions": [
      {
        "_id": "60d5ec49f1b2c72b8c8e4a20",
        "questionType": "mcq",
        "questionText": "What is 2 + 2?",
        "marks": 5,
        "order": 1
      },
      {
        "_id": "60d5ec49f1b2c72b8c8e4a21",
        "questionType": "descriptive",
        "questionText": "Explain the concept of inheritance in OOP.",
        "marks": 10,
        "order": 2
      }
    ]
  },
  "message": "Questions created successfully"
}
```

**Validation:**
- MCQ must have at least 2 options
- MCQ must have exactly one correct option
- Marks must be positive
- Negative marks must be non-negative and less than positive marks
- Order must be unique within exam

---

### 10. Update Question (University)

Update an existing question.

**Endpoint:** `PUT /api/questions/:questionId`

**Access:** University/Admin

**Request Body:** (partial update supported)
```json
{
  "questionText": "Updated question text",
  "marks": 7
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "60d5ec49f1b2c72b8c8e4a20",
    "questionText": "Updated question text",
    "marks": 7
  }
}
```

---

### 11. Delete Question (University)

Delete a question (only if no submissions reference it).

**Endpoint:** `DELETE /api/questions/:questionId`

**Access:** University/Admin

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Question deleted successfully"
}
```

**Error Response:** `400 Bad Request`
```json
{
  "success": false,
  "message": "Cannot delete question: submissions exist"
}
```

---

## Submission Endpoints

### 12. Submit Answer

Submit or update answer for a question during exam.

**Endpoint:** `POST /api/exam-submissions/:submissionId/answer`

**Access:** Student only

**Request Body:**
```json
{
  "questionId": "60d5ec49f1b2c72b8c8e4a20",
  "questionType": "mcq",
  "selectedOption": 1
}
```

Or for descriptive:
```json
{
  "questionId": "60d5ec49f1b2c72b8c8e4a21",
  "questionType": "descriptive",
  "textAnswer": "Inheritance is a fundamental concept in OOP..."
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "submission": {
      "_id": "60d5ec49f1b2c72b8c8e4a1e",
      "answers": [
        {
          "question": "60d5ec49f1b2c72b8c8e4a20",
          "questionType": "mcq",
          "selectedOption": 1
        }
      ]
    }
  },
  "message": "Answer saved successfully"
}
```

**Validation:**
- Submission must belong to requesting student
- Submission status must be 'in-progress'
- For MCQ: selectedOption must be valid index
- For descriptive: textAnswer max length 10,000 characters

---

### 13. Upload Answer Sheet

Upload answer sheet for PDF-based exams.

**Endpoint:** `POST /api/exam-submissions/:submissionId/answer-sheet`

**Access:** Student only

**Content-Type:** `multipart/form-data`

**Request Body:**
```
answerSheet: <PDF or image file>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "answerSheetUrl": "https://storage.example.com/exams/answer-sheets/student123/xyz789.pdf"
  },
  "message": "Answer sheet uploaded successfully"
}
```

**Validation:**
- File must be PDF or image format (jpg, jpeg, png)
- File size must not exceed 20MB

---

### 14. Submit Exam

Final submission of exam.

**Endpoint:** `POST /api/exam-submissions/:submissionId/submit`

**Access:** Student only

**Request Body:**
```json
{
  "isAutoSubmitted": false
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "submission": {
      "_id": "60d5ec49f1b2c72b8c8e4a1e",
      "status": "submitted",
      "submittedAt": "2024-03-15T11:45:00Z",
      "timeSpent": 6000,
      "isAutoSubmitted": false
    }
  },
  "message": "Exam submitted successfully. Confirmation email sent."
}
```

---

### 15. Get My Submission

Retrieve student's own submission for an exam.

**Endpoint:** `GET /api/exam-submissions/exam/:examId/my-submission`

**Access:** Student only

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "60d5ec49f1b2c72b8c8e4a1e",
    "exam": "60d5ec49f1b2c72b8c8e4a1d",
    "student": "60d5ec49f1b2c72b8c8e4a1f",
    "startedAt": "2024-03-15T10:05:00Z",
    "submittedAt": "2024-03-15T11:45:00Z",
    "status": "submitted",
    "answers": [
      {
        "question": {
          "_id": "60d5ec49f1b2c72b8c8e4a20",
          "questionText": "What is 2 + 2?",
          "questionType": "mcq"
        },
        "selectedOption": 1
      }
    ]
  }
}
```

---

## Grading Endpoints

### 16. Auto-Grade Exam (University)

Automatically grade all MCQ submissions for an exam.

**Endpoint:** `POST /api/exams/:examId/auto-grade`

**Access:** University/Admin

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "gradedCount": 45,
    "summary": {
      "totalSubmissions": 45,
      "averageScore": 72.5,
      "highestScore": 95,
      "lowestScore": 42
    }
  },
  "message": "Auto-grading completed for 45 submissions"
}
```

---

### 17. Get Submissions for Grading (University)

Retrieve submissions for manual grading.

**Endpoint:** `GET /api/submissions/exam/:examId`

**Access:** University/Admin

**Query Parameters:**
- `status` (optional): Filter by status (`submitted`, `graded`)
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "submissions": [
      {
        "_id": "60d5ec49f1b2c72b8c8e4a1e",
        "student": {
          "_id": "60d5ec49f1b2c72b8c8e4a1f",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "submittedAt": "2024-03-15T11:45:00Z",
        "status": "submitted",
        "answers": [...]
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalSubmissions": 25
    }
  }
}
```

---

### 18. Grade Submission (University)

Manually grade a submission with marks and feedback.

**Endpoint:** `POST /api/submissions/:submissionId/grade`

**Access:** University/Admin

**Request Body:**
```json
{
  "answers": [
    {
      "questionId": "60d5ec49f1b2c72b8c8e4a21",
      "marksAwarded": 8,
      "feedback": "Good explanation but missing key points about polymorphism."
    },
    {
      "questionId": "60d5ec49f1b2c72b8c8e4a22",
      "marksAwarded": 10,
      "feedback": "Excellent answer with clear examples."
    }
  ],
  "overallFeedback": "Well done overall. Focus on providing more detailed examples."
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "submission": {
      "_id": "60d5ec49f1b2c72b8c8e4a1e",
      "status": "graded",
      "obtainedMarks": 78,
      "percentage": 78,
      "gradedBy": "60d5ec49f1b2c72b8c8e4a23",
      "gradedAt": "2024-03-16T09:30:00Z"
    },
    "result": {
      "_id": "60d5ec49f1b2c72b8c8e4a24",
      "grade": "B+",
      "isPassed": true
    }
  },
  "message": "Submission graded successfully"
}
```

**Validation:**
- All questions must have marksAwarded
- marksAwarded must be between 0 and question's maximum marks

---

## Result Endpoints

### 19. Generate Results (University)

Generate results with rankings for all graded submissions.

**Endpoint:** `POST /api/exams/:examId/generate-results`

**Access:** University/Admin

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "resultsGenerated": 45,
    "statistics": {
      "averageScore": 72.5,
      "passRate": 88.9,
      "highestScore": 95,
      "lowestScore": 42
    }
  },
  "message": "Results generated successfully for 45 students"
}
```

---

### 20. Publish Results (University)

Make results visible to students.

**Endpoint:** `POST /api/exams/:examId/publish-results`

**Access:** University/Admin

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "publishedCount": 45,
    "publishedAt": "2024-03-16T10:00:00Z"
  },
  "message": "Results published successfully. Notifications sent to students."
}
```

**Error Response:** `400 Bad Request`
```json
{
  "success": false,
  "message": "Cannot publish results: 5 submissions are not yet graded"
}
```

---

### 21. Get Exam Results (University)

Retrieve all results for an exam with statistics.

**Endpoint:** `GET /api/results/exam/:examId`

**Access:** University/Admin

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "_id": "60d5ec49f1b2c72b8c8e4a24",
        "student": {
          "_id": "60d5ec49f1b2c72b8c8e4a1f",
          "name": "John Doe"
        },
        "totalMarks": 100,
        "obtainedMarks": 78,
        "percentage": 78,
        "grade": "B+",
        "isPassed": true,
        "rank": 12
      }
    ],
    "statistics": {
      "totalStudents": 45,
      "averageScore": 72.5,
      "passRate": 88.9,
      "gradeDistribution": {
        "A+": 5,
        "A": 10,
        "B+": 15,
        "B": 8,
        "C": 5,
        "D": 1,
        "F": 1
      }
    }
  }
}
```

---

### 22. Get Student Result

Retrieve a specific student's result (with visibility control).

**Endpoint:** `GET /api/results/exam/:examId/student/:studentId`

**Access:** Student (own result), University/Admin (any result)

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "60d5ec49f1b2c72b8c8e4a24",
    "exam": {
      "_id": "60d5ec49f1b2c72b8c8e4a1d",
      "title": "Midterm Examination"
    },
    "totalMarks": 100,
    "obtainedMarks": 78,
    "percentage": 78,
    "grade": "B+",
    "isPassed": true,
    "rank": 12,
    "isPublished": true,
    "publishedAt": "2024-03-16T10:00:00Z",
    "viewedByStudent": true,
    "viewedAt": "2024-03-16T10:15:00Z",
    "submission": {
      "answers": [
        {
          "question": {
            "questionText": "What is 2 + 2?",
            "marks": 5
          },
          "selectedOption": 1,
          "isCorrect": true,
          "marksAwarded": 5
        }
      ]
    }
  }
}
```

**Error Response (Not Published):** `403 Forbidden`
```json
{
  "success": false,
  "message": "Results have not been published yet"
}
```

---

## WebSocket Events

### Connection

Connect to WebSocket server for real-time exam updates.

**URL:** `ws://localhost:5000`

**Authentication:** Send JWT token in connection query:
```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Events

#### 1. Join Exam Room

**Event:** `join-exam`

**Payload:**
```json
{
  "examId": "60d5ec49f1b2c72b8c8e4a1d",
  "studentId": "60d5ec49f1b2c72b8c8e4a1f"
}
```

#### 2. Time Remaining Update

**Event:** `time-remaining` (received from server)

**Payload:**
```json
{
  "examId": "60d5ec49f1b2c72b8c8e4a1d",
  "timeRemaining": 3600,
  "formattedTime": "01:00:00"
}
```

#### 3. Time Warning

**Event:** `time-warning` (received from server)

**Payload:**
```json
{
  "examId": "60d5ec49f1b2c72b8c8e4a1d",
  "minutesRemaining": 5,
  "message": "5 minutes remaining!"
}
```

#### 4. Auto-Submit Notification

**Event:** `auto-submit` (received from server)

**Payload:**
```json
{
  "examId": "60d5ec49f1b2c72b8c8e4a1d",
  "submissionId": "60d5ec49f1b2c72b8c8e4a1e",
  "message": "Time expired. Your exam has been automatically submitted."
}
```

#### 5. Leave Exam Room

**Event:** `leave-exam`

**Payload:**
```json
{
  "examId": "60d5ec49f1b2c72b8c8e4a1d"
}
```

---

## Error Responses

### Standard Error Format

All error responses follow this format:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "fieldName",
      "message": "Specific error message"
    }
  ]
}
```

### Common HTTP Status Codes

- `200 OK`: Request successful
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request data or validation error
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Insufficient permissions or access denied
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

### Example Error Responses

**Validation Error:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "scheduledEndTime",
      "message": "End time must be after start time"
    },
    {
      "field": "totalMarks",
      "message": "Total marks must be a positive number"
    }
  ]
}
```

**Authorization Error:**
```json
{
  "success": false,
  "message": "Access denied. Admin role required."
}
```

**Resource Not Found:**
```json
{
  "success": false,
  "message": "Exam not found"
}
```

---

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **General API**: 100 requests per 15 minutes per IP
- **File Upload**: 10 requests per hour per user
- **Exam Start**: 3 requests per exam per student

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1647345600
```

---

## Pagination

Endpoints that return lists support pagination with these query parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

Pagination metadata is included in responses:
```json
{
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 47,
    "limit": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## Best Practices

1. **Always validate exam access** before allowing students to start exams
2. **Use WebSocket for real-time updates** during active exams
3. **Implement proper error handling** for file uploads
4. **Cache exam data** on the client to reduce API calls
5. **Handle auto-submission gracefully** in the UI
6. **Verify result publication status** before displaying to students
7. **Use pagination** for large result sets
8. **Implement retry logic** for failed WebSocket connections

---

## Support

For API issues or questions, contact the development team or refer to the main documentation.
