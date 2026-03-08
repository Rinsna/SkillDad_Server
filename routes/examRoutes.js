const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { query } = require('../config/postgres');
const auditLogService = require('../services/auditLogService');
const examController = require('../controllers/examController');
const examSubmissionController = require('../controllers/examSubmissionController');

// Standardized PG implementation for Exam Routes

// @desc    Get all exams (Admin/University)
router.get('/', protect, authorize('admin', 'university'), async (req, res) => {
    try {
        const userRole = req.user.role?.toLowerCase();
        let examsRes;

        if (userRole === 'admin') {
            examsRes = await query(`
                SELECT e.*, c.title as course_title, u.name as university_name, cr.name as creator_name
                FROM exams e
                JOIN courses c ON e.course_id = c.id
                LEFT JOIN users u ON e.university_id = u.id
                LEFT JOIN users cr ON e.created_by = cr.id
                ORDER BY e.created_at DESC
            `);
        } else {
            // University filter
            examsRes = await query(`
                SELECT e.*, c.title as course_title, u.name as university_name, cr.name as creator_name
                FROM exams e
                JOIN courses c ON e.course_id = c.id
                LEFT JOIN users u ON e.university_id = u.id
                LEFT JOIN users cr ON e.created_by = cr.id
                WHERE e.university_id = $1 OR e.created_by = $1
                ORDER BY e.created_at DESC
            `, [req.user._id.toString()]);
        }

        res.json(examsRes.rows);
    } catch (error) {
        console.error('[PG EXAM] Error fetching all exams:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Schedule a new exam
router.post('/admin/schedule', protect, authorize('admin', 'university'), async (req, res) => {
    try {
        const {
            title, description, courseId, universityId,
            examType, scheduledStartTime, scheduledEndTime,
            duration, totalPoints, passingScore
        } = req.body;

        const newId = `exam_${Date.now()}`;

        await query(`
            INSERT INTO exams (
                id, title, description, course_id, university_id, 
                exam_type, scheduled_start_time, scheduled_end_time, 
                duration, total_points, passing_score, created_by, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'scheduled')
        `, [
            newId, title, description, courseId, universityId || req.user._id.toString(),
            examType || 'online-mcq', scheduledStartTime, scheduledEndTime,
            duration, totalPoints || 100, passingScore || 40, req.user._id.toString()
        ]);

        await auditLogService.logAuditEvent({
            userId: req.user._id,
            action: 'exam_created',
            resource: 'exam',
            resourceId: newId,
            details: { title, courseId },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent') || 'unknown'
        });

        res.status(201).json({ success: true, examId: newId });
    } catch (error) {
        console.error('[PG EXAM] Error scheduling exam:', error);
        res.status(500).json({ message: error.message });
    }
});

// Use refactored controller methods for student flow
router.get('/student/my-exams', protect, examController.getStudentExams);
router.post('/:examId/start', protect, examController.startExam);

// Submission related routes
router.post('/:submissionId/answer', protect, examSubmissionController.submitAnswer);
router.post('/:submissionId/submit', protect, examSubmissionController.submitExam);
router.get('/exam/:examId/my-submission', protect, examSubmissionController.getMySubmission);

// Admin/University Result/Grading routes
router.get('/:submissionId/for-grading', protect, authorize('admin', 'university'), examSubmissionController.getSubmissionForGrading);

module.exports = router;