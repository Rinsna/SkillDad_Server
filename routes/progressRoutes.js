const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/authMiddleware');
const ProgressTrackerService = require('../services/ProgressTrackerService');
const Submission = require('../models/submissionModel');

/**
 * @desc    Get user progress for a course
 * @route   GET /api/progress/:userId/:courseId
 * @access  Private (Student - own progress, University - their course progress)
 * 
 * Requirements: 9.5, 9.6, 9.7
 */
router.get('/:userId/:courseId', protect, asyncHandler(async (req, res) => {
    const { userId, courseId } = req.params;
    const requestingUserId = req.user.id;
    const userRole = req.user.role;

    // Authorization: Students can only view their own progress
    if (userRole === 'student' && userId !== requestingUserId) {
        res.status(403);
        throw new Error('Not authorized to view this progress');
    }

    // Get progress summary
    const progress = await ProgressTrackerService.getProgress(userId, courseId);

    // Get submission history for detailed view
    const submissions = await Submission.find({
        user: userId,
        course: courseId
    })
        .populate('content', 'title type')
        .sort({ submittedAt: -1 });

    res.status(200).json({
        success: true,
        progress,
        submissions
    });
}));

module.exports = router;
