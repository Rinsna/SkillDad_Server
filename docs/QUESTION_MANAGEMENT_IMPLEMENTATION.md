# Question Management Implementation

## Overview
This document describes the implementation of question management functionality for the Exam Management System (Task 5).

## Implemented Components

### 1. Question Controller (`server/controllers/questionController.js`)

#### Functions Implemented:

##### `createOnlineQuestions(req, res)`
- **Route**: `POST /api/exams/:examId/questions`
- **Access**: Private (University/Admin)
- **Purpose**: Bulk creation of online questions for an exam
- **Features**:
  - Validates exam exists and user has authorization
  - Prevents adding online questions to PDF-based exams
  - Validates question data (type, options, marks, order)
  - Ensures order uniqueness within exam
  - Supports both MCQ and descriptive question types
  - Automatically updates exam's totalMarks
  - Returns created questions with summary

**Validation Rules**:
- MCQ questions must have at least 2 options
- MCQ questions must have exactly one correct option
- Marks must be positive
- Negative marks must be non-negative and less than marks
- Order must be unique within the exam
- Question text is required

##### `updateQuestion(req, res)`
- **Route**: `PUT /api/questions/:questionId`
- **Access**: Private (University/Admin)
- **Purpose**: Update an existing question
- **Features**:
  - Validates question exists and user has authorization
  - Validates all update constraints
  - Prevents changing the exam association
  - Checks for order conflicts
  - Updates exam's totalMarks if marks changed
  - Returns updated question

##### `deleteQuestion(req, res)`
- **Route**: `DELETE /api/questions/:questionId`
- **Access**: Private (University/Admin)
- **Purpose**: Delete a question
- **Features**:
  - Validates question exists and user has authorization
  - Prevents deletion if question is referenced by submissions
  - Updates exam's totalMarks after deletion
  - Returns deletion confirmation

##### `getExamQuestions(req, res)`
- **Route**: `GET /api/exams/:examId/questions`
- **Access**: Private
- **Purpose**: Retrieve all questions for an exam
- **Features**:
  - Returns questions sorted by order
  - Includes summary (total questions, total marks)
  - Accessible to all authenticated users

### 2. Question Routes (`server/routes/questionRoutes.js`)

Routes configured with proper authentication and authorization:
- `POST /api/exams/:examId/questions` - Create questions (University/Admin)
- `GET /api/exams/:examId/questions` - Get questions (All authenticated)
- `PUT /api/questions/:questionId` - Update question (University/Admin)
- `DELETE /api/questions/:questionId` - Delete question (University/Admin)

### 3. Server Integration

Added question routes to `server/server.js`:
```javascript
app.use('/api', require('./routes/questionRoutes'));
```

## Requirements Validated

### Requirement 3.1 - MCQ Question Creation ✓
- Validates question text, options (minimum 2), and marks
- Implemented in `createOnlineQuestions` validation

### Requirement 3.2 - MCQ Correct Answer ✓
- Ensures exactly one option is marked as correct
- Implemented in `createOnlineQuestions` validation

### Requirement 3.3 - Descriptive Question Creation ✓
- Validates question text and marks
- Implemented in `createOnlineQuestions` validation

### Requirement 3.4 - Negative Marks Validation ✓
- Validates negative marks are non-negative and less than positive marks
- Implemented in `createOnlineQuestions` and `updateQuestion` validation

### Requirement 3.5 - Order Uniqueness ✓
- Ensures order values are unique within the exam
- Implemented with compound index check and validation

### Requirement 3.6 - Question Association ✓
- Associates questions with specified exam
- Implemented in `createOnlineQuestions`

### Requirement 3.7 - Question Update ✓
- Validates all constraints before saving
- Implemented in `updateQuestion`

### Requirement 3.8 - Question Deletion ✓
- Prevents deletion if submissions reference the question
- Implemented in `deleteQuestion`

## Authorization

All endpoints implement proper authorization:
- University users can only manage questions for their own exams
- Admin users can manage questions for any exam
- Students cannot create, update, or delete questions
- All authenticated users can view questions

## Error Handling

Comprehensive error handling for:
- Invalid request data (400)
- Unauthorized access (403)
- Resource not found (404)
- Database errors (500)
- Duplicate key violations (400)

## Data Integrity

- Automatic totalMarks calculation and updates
- Order uniqueness enforcement
- Submission reference checking before deletion
- Validation of question type-specific fields

## Testing

A comprehensive test suite has been created in `server/tests/questionController.test.js` covering:
- Successful question creation
- Validation error scenarios
- MCQ-specific validations
- Order uniqueness checks
- Update operations
- Delete operations with submission checks
- Authorization checks

## API Examples

### Create Questions
```javascript
POST /api/exams/:examId/questions
Authorization: Bearer <token>

{
  "questions": [
    {
      "questionText": "What is 2+2?",
      "questionType": "mcq",
      "options": [
        { "text": "3", "isCorrect": false },
        { "text": "4", "isCorrect": true },
        { "text": "5", "isCorrect": false }
      ],
      "marks": 5,
      "negativeMarks": 1,
      "order": 1,
      "difficulty": "easy"
    },
    {
      "questionText": "Explain photosynthesis",
      "questionType": "descriptive",
      "marks": 10,
      "order": 2,
      "difficulty": "medium"
    }
  ]
}
```

### Update Question
```javascript
PUT /api/questions/:questionId
Authorization: Bearer <token>

{
  "questionText": "Updated question text",
  "marks": 8,
  "difficulty": "hard"
}
```

### Delete Question
```javascript
DELETE /api/questions/:questionId
Authorization: Bearer <token>
```

### Get Exam Questions
```javascript
GET /api/exams/:examId/questions
Authorization: Bearer <token>
```

## Notes

- Task 5.1 (uploadQuestionPaper) was already implemented in `examController.js` from Task 4
- Task 5.5 (unit tests for question validation) is marked as optional and can be implemented later
- The implementation follows the MERN stack architecture
- All functions include proper error logging for debugging
- The code follows the existing codebase patterns and conventions

## Future Enhancements

Potential improvements for future iterations:
1. Question bank/library for reusing questions across exams
2. Question difficulty-based auto-grading weights
3. Question analytics (difficulty analysis based on student performance)
4. Image upload support for question images
5. Rich text editor support for question formatting
6. Question import/export functionality
7. Question versioning for tracking changes
