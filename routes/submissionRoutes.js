const express = require('express');
const router = express.Router();
const {
    submitAnswer,
    getSubmission,
    getUserSubmissions,
    retrySubmission
} = require('../controllers/submissionController');
const { protect } = require('../middleware/authMiddleware');

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
