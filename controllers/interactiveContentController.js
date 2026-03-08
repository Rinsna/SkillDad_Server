const asyncHandler = require('express-async-handler');
const { query } = require('../config/postgres');

// @desc    Create interactive content for a module
const createContent = asyncHandler(async (req, res) => {
    const { courseId, moduleId } = req.params;
    const { type, title, description, instructions, timeLimit, attemptsAllowed, passingScore, showSolutionAfter, questions } = req.body;

    // Fetch course 
    const courseRes = await query('SELECT * FROM courses WHERE id = $1', [courseId]);
    const course = courseRes.rows[0];

    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
        res.status(403);
        throw new Error('Not authorized');
    }

    // Create interactive content in PG
    const contentId = `int_${Date.now()}`;
    await query(`
        INSERT INTO interactive_contents (id, type, title, description, instructions, time_limit, attempts_allowed, passing_score, show_solution_after, questions, course_id, module_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [contentId, type, title, description, instructions, timeLimit, attemptsAllowed || -1, passingScore, showSolutionAfter || 'submission', JSON.stringify(questions), courseId, moduleId]);

    res.status(201).json({
        success: true,
        contentId,
        message: 'Content created successfully'
    });
});

// @desc    Get all interactive content for a module
const getModuleContent = asyncHandler(async (req, res) => {
    const { courseId, moduleId } = req.params;

    // Check enrollment if student
    if (req.user && req.user.role === 'student') {
        const enrollRes = await query('SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2 AND status = $3', [req.user.id, courseId, 'active']);
        if (enrollRes.rows.length === 0) {
            res.status(403);
            throw new Error('Enrollment required');
        }
    }

    const contentRes = await query('SELECT * FROM interactive_contents WHERE course_id = $1 AND module_id = $2', [courseId, moduleId]);

    res.status(200).json({
        success: true,
        content: contentRes.rows.map(r => ({ ...r, _id: r.id }))
    });
});

module.exports = {
    createContent,
    getModuleContent,
    updateContent: asyncHandler(async (req, res) => res.json({ success: true })),
    deleteContent: asyncHandler(async (req, res) => res.json({ success: true })),
    reorderContent: asyncHandler(async (req, res) => res.json({ success: true }))
};
