const asyncHandler = require('express-async-handler');
const { query } = require('../config/postgres');

// @desc    Submit answers to interactive content
const submitAnswer = asyncHandler(async (req, res) => {
    const { contentId, answers, startedAt } = req.body;
    const userId = req.user.id;

    // Fetch interactive content from PG
    const contentRes = await query('SELECT * FROM interactive_contents WHERE id = $1', [contentId]);
    const content = contentRes.rows[0];
    if (!content) {
        res.status(404);
        throw new Error('Content not found');
    }

    // Verify enrollment
    const enrollRes = await query('SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2 AND status = $3', [userId, content.course_id, 'active']);
    if (enrollRes.rows.length === 0) {
        res.status(403);
        throw new Error('Enrollment required');
    }

    const attemptRes = await query('SELECT COUNT(*) FROM submissions WHERE user_id = $1 AND content_id = $2', [userId, contentId]);
    const attemptCount = parseInt(attemptRes.rows[0].count);

    // Simplistic grading for demo - assuming all match for now or just calculating score
    const questions = content.questions; // In PG this is likely a JSON column
    let score = 0;
    // ... grading logic ...
    score = 80; // Placeholder

    const submissionId = `sub_${Date.now()}`;
    await query(`
        INSERT INTO submissions (id, user_id, course_id, module_id, content_id, content_type, answers, score, status, attempt_number, started_at, submitted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'graded', $9, $10, NOW())
    `, [submissionId, userId, content.course_id, content.module_id, contentId, content.type, JSON.stringify(answers), score, attemptCount + 1, startedAt]);

    res.status(201).json({
        success: true,
        submissionId,
        score,
        status: 'graded',
        attemptNumber: attemptCount + 1
    });
});

module.exports = {
    submitAnswer,
    getSubmission: asyncHandler(async (req, res) => res.json({ success: true })),
    getUserSubmissions: asyncHandler(async (req, res) => res.json({ success: true })),
    retrySubmission: asyncHandler(async (req, res) => res.json({ success: true }))
};
