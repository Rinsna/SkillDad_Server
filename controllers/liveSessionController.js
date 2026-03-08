const asyncHandler = require('express-async-handler');
const { query } = require('../config/postgres');

// @desc    Create a live session
const createSession = asyncHandler(async (req, res) => {
    const { topic, description, startTime, duration, timezone, instructor, courseId } = req.body;
    const universityId = req.user.id;

    const id = `sess_${Date.now()}`;
    await query(`
        INSERT INTO live_sessions (id, topic, description, start_time, duration, timezone, instructor_id, university_id, course_id, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', NOW(), NOW())
    `, [id, topic, description, startTime, duration, timezone || 'Asia/Kolkata', instructor || req.user.id, universityId, courseId || null]);

    res.status(201).json({ success: true, id });
});

// @desc    Get all sessions for a user
const getSessions = asyncHandler(async (req, res) => {
    let sql = `
        SELECT s.*, u.name as instructor_name, c.title as course_title
        FROM live_sessions s
        JOIN users u ON s.instructor_id = u.id
        LEFT JOIN courses c ON s.course_id = c.id
        WHERE s.is_deleted = false
    `;
    const params = [];

    if (req.user.role === 'student') {
        sql += ` AND (s.university_id = $1 OR s.id IN (SELECT session_id FROM session_enrollments WHERE student_id = $2))`;
        params.push(req.user.universityId || req.user.id, req.user.id);
    } else if (req.user.role === 'university') {
        sql += ` AND s.university_id = $1`;
        params.push(req.user.id);
    }

    const resSet = await query(sql, params);
    res.json(resSet.rows.map(r => ({ ...r, _id: r.id })));
});

// @desc    Get single session
const getSession = asyncHandler(async (req, res) => {
    const resSet = await query(`
        SELECT s.*, u.name as instructor_name, u.email as instructor_email, uni.name as university_name
        FROM live_sessions s
        JOIN users u ON s.instructor_id = u.id
        JOIN users uni ON s.university_id = uni.id
        WHERE s.id = $1 AND s.is_deleted = false
    `, [req.params.id]);

    const session = resSet.rows[0];
    if (!session) {
        res.status(404);
        throw new Error('Session not found');
    }

    res.json({ ...session, _id: session.id });
});

// @desc    Start session
const startSession = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await query("UPDATE live_sessions SET status = 'live', start_time = NOW() WHERE id = $1", [id]);
    res.json({ success: true, message: 'Session is live' });
});

// @desc    End session
const endSession = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await query("UPDATE live_sessions SET status = 'ended', end_time = NOW() WHERE id = $1", [id]);
    res.json({ success: true, message: 'Session ended' });
});

module.exports = {
    createSession,
    getSessions,
    getSession,
    startSession,
    endSession,
    deleteSession: asyncHandler(async (req, res) => res.json({ success: true })),
    updateSession: asyncHandler(async (req, res) => res.json({ success: true })),
    sendNotification: asyncHandler(async (req, res) => res.json({ success: true })),
    getSessionStatusRoute: asyncHandler(async (req, res) => res.json({ status: 'scheduled' })),
    getRecordingStatus: asyncHandler(async (req, res) => res.json({ status: 'pending' })),
    getRecordingPlaybackUrl: asyncHandler(async (req, res) => res.json({ playUrl: '' })),
    generateSDKSignature: asyncHandler(async (req, res) => res.json({ signature: '' })),
    getZoomSDKConfig: asyncHandler(async (req, res) => res.json({ success: true, config: {} })),
    generateHostLink: asyncHandler(async (req, res) => res.json({ success: true, joinUrl: '' })),
    trackSessionJoin: asyncHandler(async (req, res) => res.json({ success: true })),
    trackSessionLeave: asyncHandler(async (req, res) => res.json({ success: true })),
    getCourseLiveSessions: asyncHandler(async (req, res) => res.json({ success: true, sessions: [] }))
};
