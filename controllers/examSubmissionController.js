const asyncHandler = require('express-async-handler');
const { query } = require('../config/postgres');
const FileUploadService = require('../services/FileUploadService');
const auditLogService = require('../services/auditLogService');

/**
 * @desc    Submit answer for a question during exam (auto-save)
 * @route   POST /api/exam-submissions/:submissionId/answer
 * @access  Private (Student)
 */
const submitAnswer = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const { questionId, selectedOption, textAnswer } = req.body;
  const studentId = req.user._id;

  // 1. Find submission and validate ownership in PG
  const subRes = await query('SELECT * FROM exam_submissions_new WHERE id = $1', [submissionId]);
  const submission = subRes.rows[0];

  if (!submission) {
    res.status(404);
    throw new Error('Submission not found');
  }

  if (submission.student_id !== studentId.toString()) {
    res.status(403);
    throw new Error('Not authorized to modify this submission');
  }

  // 2. Validate status
  if (submission.status !== 'in-progress') {
    res.status(400);
    throw new Error('Cannot modify submitted exam');
  }

  // 3. Get question from PG
  const qRes = await query('SELECT * FROM questions WHERE id = $1', [questionId]);
  const question = qRes.rows[0];
  if (!question) {
    res.status(404);
    throw new Error('Question not found');
  }

  // 4. Update or add answer in JSONB array
  let answers = submission.answers || [];
  const existingAnswerIndex = answers.findIndex(a => (a.questionId === questionId || a.question === questionId));

  const answerData = {
    questionId: questionId,
    questionType: question.question_type,
    selectedOption: question.question_type === 'mcq' ? selectedOption : undefined,
    textAnswer: question.question_type === 'descriptive' ? textAnswer : undefined
  };

  if (existingAnswerIndex >= 0) {
    answers[existingAnswerIndex] = answerData;
  } else {
    answers.push(answerData);
  }

  // 5. Update PG
  await query(
    'UPDATE exam_submissions_new SET answers = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(answers), submissionId]
  );

  res.json({
    success: true,
    message: 'Answer saved',
    submission: { ...submission, answers }
  });
});

/**
 * @desc    Submit exam (finalize submission)
 * @route   POST /api/exam-submissions/:submissionId/submit
 * @access  Private (Student)
 */
const submitExam = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const { isAutoSubmit = false, answers } = req.body;
  const studentId = req.user._id;

  // 1. Find submission and validate ownership
  const subRes = await query(`
    SELECT s.*, e.title as exam_title, e.total_points 
    FROM exam_submissions_new s 
    JOIN exams e ON s.exam_id = e.id 
    WHERE s.id = $1
  `, [submissionId]);

  const submission = subRes.rows[0];

  if (!submission) {
    res.status(404);
    throw new Error('Submission not found');
  }

  if (submission.student_id !== studentId.toString()) {
    res.status(403);
    throw new Error('Not authorized to submit this exam');
  }

  if (submission.status !== 'in-progress') {
    res.status(400);
    throw new Error('Exam already submitted');
  }

  // 2. Process final answers if provided
  let finalAnswers = answers || submission.answers || [];

  // 3. Update status and timestamps
  const submittedAt = new Date();
  const timeSpent = Math.floor((submittedAt - new Date(submission.started_at)) / 1000);

  await query(`
    UPDATE exam_submissions_new 
    SET status = 'submitted', 
        submitted_at = $1, 
        time_spent = $2, 
        is_auto_submitted = $3, 
        answers = $4,
        updated_at = NOW()
    WHERE id = $5
  `, [submittedAt, timeSpent, isAutoSubmit, JSON.stringify(finalAnswers), submissionId]);

  // Log audit event
  await auditLogService.logAuditEvent({
    userId: studentId,
    action: isAutoSubmit ? 'exam_submitted_auto' : 'exam_submitted_manual',
    resource: 'submission',
    resourceId: submissionId,
    details: {
      examId: submission.exam_id,
      examTitle: submission.exam_title,
      timeSpent: timeSpent,
      isAutoSubmitted: isAutoSubmit,
      answersCount: finalAnswers.length
    },
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent') || 'unknown'
  });

  res.json({
    success: true,
    message: isAutoSubmit ? 'Exam auto-submitted' : 'Exam submitted successfully',
    submission: { ...submission, status: 'submitted', submitted_at: submittedAt, time_spent: timeSpent }
  });
});

/**
 * @desc    Get my submission for an exam
 * @route   GET /api/exam-submissions/exam/:examId/my-submission
 * @access  Private (Student)
 */
const getMySubmission = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const studentId = req.user._id;

  const subRes = await query(`
    SELECT s.*, e.title as exam_title, e.exam_mode, e.duration 
    FROM exam_submissions_new s
    JOIN exams e ON s.exam_id = e.id
    WHERE s.exam_id = $1 AND s.student_id = $2
  `, [examId, studentId.toString()]);

  const submission = subRes.rows[0];

  if (!submission) {
    res.status(404);
    throw new Error('Submission not found');
  }

  res.json({
    success: true,
    submission
  });
});

/**
 * @desc    Get submission details for grading
 * @route   GET /api/exam-submissions/:submissionId
 * @access  Private (University/Admin)
 */
const getSubmissionForGrading = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;

  const subRes = await query(`
    SELECT s.*, e.title as exam_title, e.total_points, e.passing_score, u.name as student_name, u.email as student_email
    FROM exam_submissions_new s
    JOIN exams e ON s.exam_id = e.id
    JOIN users u ON s.student_id = u.id
    WHERE s.id = $1
  `, [submissionId]);

  const submission = subRes.rows[0];

  if (!submission) {
    res.status(404);
    throw new Error('Submission not found');
  }

  res.json({
    success: true,
    submission
  });
});

module.exports = {
  submitAnswer,
  submitExam,
  getMySubmission,
  getSubmissionForGrading,
  // Placeholders for other methods if needed
  uploadAnswerSheet: async (req, res) => res.status(501).json({ message: 'Not implemented' }),
  getSubmissionsForExam: async (req, res) => res.status(501).json({ message: 'Not implemented' }),
  gradeSubmission: async (req, res) => res.status(501).json({ message: 'Not implemented' })
};
