const express = require('express');
const router = express.Router();
const {
    getPendingSubmissions,
    gradeSubmission,
    addFeedback,
    getSubmissionStats
} = require('../controllers/manualGradingQueueController');
const { protect } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Get pending submissions for manual grading filtered by course
router.get('/pending/:courseId', getPendingSubmissions);

// Grade a specific answer in a submission
router.post('/grade/:submissionId', gradeSubmission);

// Add feedback to an answer
router.post('/feedback/:submissionId', addFeedback);

// Get grading queue statistics for a course
router.get('/stats/:courseId', getSubmissionStats);

module.exports = router;
