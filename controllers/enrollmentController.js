const asyncHandler = require('express-async-handler');
const { query } = require('../config/postgres');

/**
 * @desc    Enroll in a course
 * @route   POST /api/enrollment/:courseId
 * @access  Private (Student)
 */
const enrollInCourse = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.id;

    // 1. Check if course exists in PG
    const courseRes = await query('SELECT * FROM courses WHERE id = $1', [courseId]);
    const course = courseRes.rows[0];
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // 2. Check if already enrolled
    const existingRes = await query('SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2', [userId, courseId]);
    if (existingRes.rows.length > 0) {
        res.status(400);
        throw new Error('Already enrolled in this course');
    }

    // 3. Create enrollment in PG
    const enrollmentId = `enroll_${Date.now()}`;
    await query(`
        INSERT INTO enrollments (id, student_id, course_id, status, progress, created_at, updated_at)
        VALUES ($1, $2, $3, 'active', 0, NOW(), NOW())
    `, [enrollmentId, userId, courseId]);

    // 4. Update student's universityId if course has instructor
    if (course.instructor_id) {
        const instRes = await query('SELECT role FROM users WHERE id = $1', [course.instructor_id]);
        if (instRes.rows[0]?.role === 'university') {
            await query('UPDATE users SET "universityId" = $1 WHERE id = $2', [course.instructor_id, userId]);
        }
    }

    res.status(201).json({ success: true, enrollmentId });
});

/**
 * @desc    Get enrolled courses for user
 */
const getMyCourses = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const enrollRes = await query(`
        SELECT e.*, c.title, c.thumbnail, c.category, u.name as instructor_name
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        LEFT JOIN users u ON c.instructor_id = u.id
        WHERE e.student_id = $1
    `, [userId]);

    const transformed = enrollRes.rows.map(row => ({
        ...row,
        _id: row.id,
        course: {
            _id: row.course_id,
            title: row.title,
            thumbnail: row.thumbnail,
            category: row.category,
            instructor: { name: row.instructor_name }
        }
    }));

    res.json(transformed);
});

/**
 * @desc    Update progress
 */
const updateProgress = asyncHandler(async (req, res) => {
    const { courseId, progress } = req.body;
    const userId = req.user.id;

    await query(`
        UPDATE enrollments 
        SET progress = $1, updated_at = NOW() 
        WHERE student_id = $2 AND course_id = $3
    `, [progress, userId, courseId]);

    res.json({ success: true, progress });
});

module.exports = {
    enrollInCourse,
    getMyCourses,
    updateProgress
};
