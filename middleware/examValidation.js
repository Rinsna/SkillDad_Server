const { body, param, query, validationResult } = require('express-validator');
const DOMPurify = require('isomorphic-dompurify');

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

/**
 * Sanitize HTML content to prevent XSS attacks
 */
const sanitizeHTML = (value) => {
  if (typeof value === 'string') {
    return DOMPurify.sanitize(value, {
      ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'p', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: []
    });
  }
  return value;
};

/**
 * Validation rules for exam scheduling
 */
const validateExamSchedule = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title must not exceed 200 characters')
    .customSanitizer(sanitizeHTML),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description must not exceed 1000 characters')
    .customSanitizer(sanitizeHTML),
  
  body('course')
    .notEmpty().withMessage('Course is required')
    .isMongoId().withMessage('Invalid course ID'),
  
  body('university')
    .notEmpty().withMessage('University is required')
    .isMongoId().withMessage('Invalid university ID'),
  
  body('examType')
    .notEmpty().withMessage('Exam type is required')
    .isIn(['pdf-based', 'online-mcq', 'online-descriptive', 'mixed'])
    .withMessage('Invalid exam type'),
  
  body('scheduledStartTime')
    .notEmpty().withMessage('Scheduled start time is required')
    .isISO8601().withMessage('Invalid date format for scheduled start time')
    .custom((value, { req }) => {
      const startTime = new Date(value);
      if (startTime < new Date()) {
        throw new Error('Scheduled start time must be in the future');
      }
      return true;
    }),
  
  body('scheduledEndTime')
    .notEmpty().withMessage('Scheduled end time is required')
    .isISO8601().withMessage('Invalid date format for scheduled end time')
    .custom((value, { req }) => {
      const startTime = new Date(req.body.scheduledStartTime);
      const endTime = new Date(value);
      if (endTime <= startTime) {
        throw new Error('Scheduled end time must be after scheduled start time');
      }
      return true;
    }),
  
  body('duration')
    .notEmpty().withMessage('Duration is required')
    .isInt({ min: 1, max: 1440 }).withMessage('Duration must be between 1 and 1440 minutes')
    .custom((value, { req }) => {
      const startTime = new Date(req.body.scheduledStartTime);
      const endTime = new Date(req.body.scheduledEndTime);
      const timeWindowMinutes = (endTime - startTime) / (1000 * 60);
      if (value > timeWindowMinutes) {
        throw new Error('Duration must fit within the time window');
      }
      return true;
    }),
  
  body('totalMarks')
    .notEmpty().withMessage('Total marks is required')
    .isInt({ min: 1, max: 1000 }).withMessage('Total marks must be between 1 and 1000'),
  
  body('passingScore')
    .optional()
    .isInt({ min: 0, max: 100 }).withMessage('Passing score must be between 0 and 100'),
  
  body('allowLateSubmission')
    .optional()
    .isBoolean().withMessage('Allow late submission must be a boolean'),
  
  body('lateSubmissionDeadline')
    .optional()
    .isISO8601().withMessage('Invalid date format for late submission deadline')
    .custom((value, { req }) => {
      if (req.body.allowLateSubmission && value) {
        const endTime = new Date(req.body.scheduledEndTime);
        const lateDeadline = new Date(value);
        if (lateDeadline <= endTime) {
          throw new Error('Late submission deadline must be after scheduled end time');
        }
      }
      return true;
    }),
  
  body('instructions')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Instructions must not exceed 2000 characters')
    .customSanitizer(sanitizeHTML),
  
  handleValidationErrors
];

/**
 * Validation rules for question creation
 */
const validateQuestion = [
  body('questionText')
    .trim()
    .notEmpty().withMessage('Question text is required')
    .isLength({ max: 2000 }).withMessage('Question text must not exceed 2000 characters')
    .customSanitizer(sanitizeHTML),
  
  body('questionType')
    .notEmpty().withMessage('Question type is required')
    .isIn(['mcq', 'descriptive']).withMessage('Invalid question type'),
  
  body('marks')
    .notEmpty().withMessage('Marks is required')
    .isInt({ min: 1, max: 100 }).withMessage('Marks must be between 1 and 100'),
  
  body('negativeMarks')
    .optional()
    .isFloat({ min: 0 }).withMessage('Negative marks must be non-negative')
    .custom((value, { req }) => {
      if (value >= req.body.marks) {
        throw new Error('Negative marks must be less than marks');
      }
      return true;
    }),
  
  body('options')
    .if(body('questionType').equals('mcq'))
    .isArray({ min: 2, max: 10 }).withMessage('MCQ must have between 2 and 10 options'),
  
  body('options.*.text')
    .if(body('questionType').equals('mcq'))
    .trim()
    .notEmpty().withMessage('Option text is required')
    .isLength({ max: 500 }).withMessage('Option text must not exceed 500 characters')
    .customSanitizer(sanitizeHTML),
  
  body('options.*.isCorrect')
    .if(body('questionType').equals('mcq'))
    .isBoolean().withMessage('isCorrect must be a boolean'),
  
  body('order')
    .notEmpty().withMessage('Order is required')
    .isInt({ min: 1 }).withMessage('Order must be a positive integer'),
  
  body('difficulty')
    .optional()
    .isIn(['easy', 'medium', 'hard']).withMessage('Invalid difficulty level'),
  
  handleValidationErrors
];

/**
 * Validation rules for answer submission
 */
const validateAnswerSubmission = [
  body('questionId')
    .notEmpty().withMessage('Question ID is required')
    .isMongoId().withMessage('Invalid question ID'),
  
  body('selectedOption')
    .optional()
    .isInt({ min: 0 }).withMessage('Selected option must be a non-negative integer'),
  
  body('textAnswer')
    .optional()
    .trim()
    .isLength({ max: 10000 }).withMessage('Text answer must not exceed 10000 characters')
    .customSanitizer(sanitizeHTML),
  
  handleValidationErrors
];

/**
 * Validation rules for grading submission
 */
const validateGrading = [
  body('answers')
    .isArray({ min: 1 }).withMessage('Answers array is required'),
  
  body('answers.*.questionId')
    .notEmpty().withMessage('Question ID is required')
    .isMongoId().withMessage('Invalid question ID'),
  
  body('answers.*.marksAwarded')
    .notEmpty().withMessage('Marks awarded is required')
    .isFloat({ min: 0 }).withMessage('Marks awarded must be non-negative'),
  
  body('answers.*.feedback')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Feedback must not exceed 1000 characters')
    .customSanitizer(sanitizeHTML),
  
  body('overallFeedback')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Overall feedback must not exceed 1000 characters')
    .customSanitizer(sanitizeHTML),
  
  handleValidationErrors
];

/**
 * Validation rules for MongoDB ObjectId parameters
 */
const validateObjectId = (paramName) => [
  param(paramName)
    .isMongoId().withMessage(`Invalid ${paramName}`),
  handleValidationErrors
];

/**
 * Validation rules for pagination
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  query('sortBy')
    .optional()
    .isString().withMessage('Sort by must be a string'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  
  handleValidationErrors
];

module.exports = {
  validateExamSchedule,
  validateQuestion,
  validateAnswerSubmission,
  validateGrading,
  validateObjectId,
  validatePagination,
  handleValidationErrors,
  sanitizeHTML
};
