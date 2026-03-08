const asyncHandler = require('express-async-handler');
const { query } = require('../config/postgres');

// @desc    Get pending submissions for manual grading
const getPendingSubmissions = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const instructorId = req.user.id;

    const submissionsRes = await query(`
        SELECT s.*, u.name as student_name, u.email as student_email, c.title as content_title
        FROM submissions s
        JOIN users u ON s.user_id = u.id
        JOIN interactive_contents c ON s.content_id = c.id
        WHERE s.course_id = $1 AND s.status = 'needs-review'
        ORDER BY s.submitted_at ASC
    `, [courseId]);

    res.status(200).json({
        success: true,
        count: submissionsRes.rows.length,
        submissions: submissionsRes.rows.map(r => ({ ...r, _id: r.id }))
    });
});

// @desc    Grade a specific submission
const gradeSubmission = asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;
    const instructorId = req.user.id;

    await query(`
        UPDATE submissions 
        SET score = $1, status = 'graded', graded_by = $2, graded_at = NOW(), feedback = $3
        WHERE id = $4
    `, [score, instructorId, feedback, submissionId]);

    res.status(200).json({
        success: true,
        message: 'Submission graded'
    });
});

module.exports = {
    getPendingSubmissions,
    gradeSubmission,
    addFeedback: asyncHandler(async (req, res) => res.json({ success: true })),
    getSubmissionStats: asyncHandler(async (req, res) => res.json({ stats: { total: 0 } }))
};
