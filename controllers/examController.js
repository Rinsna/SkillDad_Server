const asyncHandler = require('express-async-handler');
const { query } = require('../config/postgres');
const FileUploadService = require('../services/FileUploadService');
const auditLogService = require('../services/auditLogService');
const examAccessService = require('../services/examAccessService');
const autoGradingService = require('../services/autoGradingService');

/**
 * @desc    Get student's exams
 * @access  Private (Student)
 */
const getStudentExams = asyncHandler(async (req, res) => {
  const studentId = req.user._id.toString();

  // 1. Get enrolled courses from PG
  const enrollRes = await query(`
      SELECT course_id FROM enrollments WHERE student_id = $1 AND status = 'active'
  `, [studentId]);
  const courseIds = enrollRes.rows.map(r => r.course_id);

  if (courseIds.length === 0) {
    return res.json({ success: true, data: [] });
  }

  // 2. Fetch exams for these courses from PG
  const examsRes = await query(`
      SELECT e.*, c.title as course_title, u.name as university_name
      FROM exams e
      JOIN courses c ON e.course_id = c.id
      LEFT JOIN users u ON e.university_id = u.id
      WHERE e.course_id = ANY($1)
  `, [courseIds]);
  const exams = examsRes.rows;

  // 3. Get questions and submissions from PG
  const examIds = exams.map(e => e.id);
  const qRes = await query('SELECT * FROM questions WHERE exam_id = ANY($1) ORDER BY "order" ASC', [examIds]);
  const questions = qRes.rows;

  const subRes = await query('SELECT * FROM exam_submissions_new WHERE student_id = $1 AND exam_id = ANY($2)', [studentId, examIds]);
  const submissions = subRes.rows;

  // 4. Combine data
  const examsWithStatus = exams.map(exam => {
    const examQuestions = questions.filter(q => q.exam_id === exam.id);
    const sub = submissions.find(s => s.exam_id === exam.id);

    return {
      _id: exam.id,
      title: exam.title,
      course_id: exam.course_id,
      course: { title: exam.course_title },
      university: { name: exam.university_name },
      examType: exam.exam_type,
      scheduledStartTime: exam.scheduled_start_time,
      scheduledEndTime: exam.scheduled_end_time,
      duration: exam.duration,
      totalMarks: exam.total_points,
      questions: examQuestions.map(q => ({ ...q, _id: q.id, question: q.question_text })),
      submission: sub ? { ...sub, _id: sub.id } : null,
      hasSubmitted: sub && sub.status !== 'in-progress'
    };
  });

  res.json({ success: true, count: examsWithStatus.length, data: examsWithStatus });
});

/**
 * @desc    Start exam for student
 */
const startExam = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const studentId = req.user._id.toString();

  // 1. Check access in PG
  const accessResult = await examAccessService.checkExamAccess(examId, studentId);
  if (!accessResult.canAccess) {
    res.status(403);
    throw new Error(accessResult.reason);
  }

  const exam = accessResult.exam;

  // 2. Check for in-progress submission in PG
  const subRes = await query(`
      SELECT * FROM exam_submissions_new 
      WHERE exam_id = $1 AND student_id = $2 AND status = 'in-progress'
  `, [examId, studentId]);

  let submission = subRes.rows[0];

  // 3. Create new if not exists
  if (!submission) {
    const newId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await query(`
      INSERT INTO exam_submissions_new (id, exam_id, student_id, started_at, status, total_marks)
      VALUES ($1, $2, $3, NOW(), 'in-progress', $4)
    `, [newId, examId, studentId, exam.total_points]);

    const newSubRes = await query('SELECT * FROM exam_submissions_new WHERE id = $1', [newId]);
    submission = newSubRes.rows[0];

    // Log audit
    await auditLogService.logAuditEvent({
      userId: studentId,
      action: 'exam_started',
      resource: 'exam',
      resourceId: examId,
      details: { examTitle: exam.title, submissionId: submission.id },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent') || 'unknown'
    });
  }

  res.json({
    success: true,
    submission: { ...submission, _id: submission.id },
    exam: {
      _id: exam.id,
      title: exam.title,
      examType: exam.exam_type,
      duration: exam.duration,
      totalMarks: exam.total_points,
      instructions: exam.instructions
    },
    timeRemaining: accessResult.timeRemaining
  });
});

/**
 * @desc    Auto-grade all MCQ submissions for an exam
 */
const autoGradeExam = asyncHandler(async (req, res) => {
  const { examId } = req.params;

  // 1. Find exam in PG
  const examRes = await query('SELECT * FROM exams WHERE id = $1', [examId]);
  const exam = examRes.rows[0];
  if (!exam) {
    res.status(404);
    throw new Error('Exam not found');
  }

  // 2. Fetch all submitted but ungraded MCQ submissions
  const subRes = await query(`
    SELECT id FROM exam_submissions_new 
    WHERE exam_id = $1 AND status = 'submitted'
  `, [examId]);

  const submissionIds = subRes.rows.map(r => r.id);
  const results = [];

  for (const subId of submissionIds) {
    try {
      const result = await autoGradingService.autoGradeMCQSubmission(subId);
      results.push(result);
    } catch (err) {
      console.error(`[AutoGrade] Failed for ${subId}:`, err.message);
    }
  }

  res.json({
    success: true,
    count: results.length,
    gradedCount: results.length,
    message: `Processed ${results.length} submissions for auto-grading`
  });
});

module.exports = {
  getStudentExams,
  startExam,
  autoGradeExam
};
