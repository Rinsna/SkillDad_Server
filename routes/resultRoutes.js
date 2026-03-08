const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const resultController = require('../controllers/resultController');

// ============================================
// RESULT MANAGEMENT ROUTES
// ============================================

// @desc    Publish results for an exam
// @route   POST /api/results/exams/:examId/publish-results
// @access  Private (University/Admin)
router.post(
    '/exams/:examId/publish-results',
    protect,
    authorize('university', 'admin'),
    resultController.publishResults
);

// @desc    Get all results for an exam with statistics
// @route   GET /api/results/exam/:examId
// @access  Private (University/Admin)
router.get(
    '/exam/:examId',
    protect,
    authorize('university', 'admin'),
    resultController.getExamResults
);

// @desc    Get result for a specific student
// @route   GET /api/results/exam/:examId/student/:studentId
// @access  Private (Student - own result, University/Admin - any result)
router.get(
    '/exam/:examId/student/:studentId',
    protect,
    resultController.getStudentResult
);

module.exports = router;
