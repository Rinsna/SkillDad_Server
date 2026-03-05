const express = require('express');
const router = express.Router();
const {
    submitAnswer,
    getSubmission,
    getUserSubmissions,
    retrySubmission
} = require('../controllers/submissionController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Submit answers to interactive content
router.post('/', submitAnswer);

// Get a single submission by ID
router.get('/:submissionId', getSubmission);

// Get all submissions for a user in a course
router.get('/course/:courseId', getUserSubmissions);

// Retry a submission (create new attempt)
router.post('/:submissionId/retry', retrySubmission);

module.exports = router;

// Import exam submission controller functions
const {
    getSubmissionsForExam,
    gradeSubmission
} = require('../controllers/examSubmissionController');

// Get all submissions for an exam (for grading)
// GET /api/submissions/exam/:examId
router.get('/exam/:examId', protect, authorize('university', 'admin'), getSubmissionsForExam);

// Grade a submission manually
// POST /api/submissions/:submissionId/grade
router.post('/:submissionId/grade', protect, authorize('university', 'admin'), gradeSubmission);
