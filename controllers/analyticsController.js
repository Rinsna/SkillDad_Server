const asyncHandler = require('express-async-handler');
const { query } = require('../config/postgres');

// @desc    Get analytics for a course
const getCourseAnalytics = asyncHandler(async (req, res) => {
    const { courseId } = req.params;

    // Submission stats from PG
    const statsRes = await query(`
        SELECT 
            COUNT(*) as total_submissions,
            AVG(score) as average_score,
            COUNT(CASE WHEN status = 'graded' THEN 1 END) as graded_submissions,
            COUNT(CASE WHEN status = 'needs-review' THEN 1 END) as pending_submissions
        FROM submissions
        WHERE course_id = $1
    `, [courseId]);

    const stats = statsRes.rows[0];

    res.status(200).json({
        success: true,
        courseId,
        submissionStatistics: {
            total: parseInt(stats.total_submissions),
            graded: parseInt(stats.graded_submissions),
            pending: parseInt(stats.pending_submissions),
            averageScore: Math.round(parseFloat(stats.average_score || 0) * 10) / 10
        }
    });
});

module.exports = {
    getCourseAnalytics,
    getContentAnalytics: asyncHandler(async (req, res) => res.json({ success: true }))
};
