const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    getCourseAnalytics,
    getContentAnalytics
} = require('../controllers/analyticsController');

/**
 * Analytics Routes for Interactive Content
 * 
 * All routes require authentication and university/admin role
 */

// @route   GET /api/analytics/:courseId
// @desc    Get comprehensive analytics for a course's interactive content
// @access  Private (University/Instructor)
router.get(
    '/:courseId',
    protect,
    authorize('university', 'admin'),
    getCourseAnalytics
);

// @route   GET /api/analytics/:courseId/content/:contentId
// @desc    Get detailed analytics for a specific content item
// @access  Private (University/Instructor)
router.get(
    '/:courseId/content/:contentId',
    protect,
    authorize('university', 'admin'),
    getContentAnalytics
);

module.exports = router;
