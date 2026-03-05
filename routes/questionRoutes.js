const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const questionController = require('../controllers/questionController');

// ============================================
// QUESTION MANAGEMENT ROUTES
// ============================================

// @desc    Create online questions for an exam (bulk creation)
// @route   POST /api/exams/:examId/questions
// @access  Private (University/Admin)
router.post(
    '/exams/:examId/questions',
    protect,
    authorize('university', 'admin'),
    questionController.createOnlineQuestions
);

// @desc    Get all questions for an exam
// @route   GET /api/exams/:examId/questions
// @access  Private
router.get(
    '/exams/:examId/questions',
    protect,
    questionController.getExamQuestions
);

// @desc    Update a question
// @route   PUT /api/questions/:questionId
// @access  Private (University/Admin)
router.put(
    '/questions/:questionId',
    protect,
    authorize('university', 'admin'),
    questionController.updateQuestion
);

// @desc    Delete a question
// @route   DELETE /api/questions/:questionId
// @access  Private (University/Admin)
router.delete(
    '/questions/:questionId',
    protect,
    authorize('university', 'admin'),
    questionController.deleteQuestion
);

module.exports = router;
