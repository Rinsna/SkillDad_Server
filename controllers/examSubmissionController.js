const asyncHandler = require('express-async-handler');
const ExamSubmissionNew = require('../models/examSubmissionNewModel');
const Question = require('../models/questionModel');
const Exam = require('../models/examModel');
const FileUploadService = require('../services/FileUploadService');
const auditLogService = require('../services/auditLogService');

/**
 * @desc    Submit answer for a question during exam (auto-save)
 * @route   POST /api/exam-submissions/:submissionId/answer
 * @access  Private (Student)
 * 
 * Requirements: 5.6, 6.1, 6.2, 16.6, 16.7, 19.1
 */
const submitAnswer = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const { questionId, selectedOption, textAnswer } = req.body;
  const studentId = req.user._id;

  // 1. Find submission and validate ownership
  const submission = await ExamSubmissionNew.findById(submissionId);
  if (!submission) {
    res.status(404);
    throw new Error('Submission not found');
  }

  if (submission.student.toString() !== studentId.toString()) {
    res.status(403);
    throw new Error('Not authorized to modify this submission');
  }

  // 2. Validate status is in-progress
  if (submission.status !== 'in-progress') {
    res.status(400);
    throw new Error('Cannot modify submitted exam');
  }

  // 3. Get question to validate answer
  const question = await Question.findById(questionId);
  if (!question) {
    res.status(404);
    throw new Error('Question not found');
  }

  // 4. Validate answer based on question type
  if (question.questionType === 'mcq') {
    if (selectedOption === undefined || selectedOption === null) {
      res.status(400);
      throw new Error('selectedOption required for MCQ');
    }
    if (selectedOption < 0 || selectedOption >= question.options.length) {
      res.status(400);
      throw new Error('Invalid option index');
    }
  } else if (question.questionType === 'descriptive') {
    if (!textAnswer) {
      res.status(400);
      throw new Error('textAnswer required for descriptive question');
    }
    if (textAnswer.length > 10000) {
      res.status(400);
      throw new Error('Answer exceeds 10,000 character limit');
    }
  }

  // 5. Update or add answer in submission.answers array
  const existingAnswerIndex = submission.answers.findIndex(
    a => a.question.toString() === questionId
  );

  const answerData = {
    question: questionId,
    questionType: question.questionType,
    selectedOption: question.questionType === 'mcq' ? selectedOption : undefined,
    textAnswer: question.questionType === 'descriptive' ? textAnswer : undefined
  };

  // Track answer changes for exam integrity
  const examIntegrityService = require('../services/examIntegrityService');
  
  if (existingAnswerIndex >= 0) {
    // Log answer change
    await examIntegrityService.logAnswerChange(
      submissionId,
      questionId,
      submission.answers[existingAnswerIndex],
      answerData,
      studentId,
      req
    );
    
    // Track change in submission
    examIntegrityService.trackAnswerChange(submission, questionId, answerData);
    
    submission.answers[existingAnswerIndex] = answerData;
  } else {
    submission.answers.push(answerData);
  }

  // 6. Save immediately (auto-save)
  await submission.save();

  // 7. Return updated submission
  res.json({
    success: true,
    message: 'Answer saved',
    submission
  });
});

/**
 * @desc    Upload answer sheet for PDF-based exam
 * @route   POST /api/exam-submissions/:submissionId/answer-sheet
 * @access  Private (Student)
 * 
 * Requirements: 6.3, 6.4, 6.5, 6.6, 19.5
 */
const uploadAnswerSheet = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const studentId = req.user._id;

  // 1. Validate file exists
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  // 2. Find submission and validate ownership
  const submission = await ExamSubmissionNew.findById(submissionId);
  if (!submission) {
    res.status(404);
    throw new Error('Submission not found');
  }

  if (submission.student.toString() !== studentId.toString()) {
    res.status(403);
    throw new Error('Not authorized to modify this submission');
  }

  // 3. Validate status is in-progress
  if (submission.status !== 'in-progress') {
    res.status(400);
    throw new Error('Cannot modify submitted exam');
  }

  // 4. Upload file using FileUploadService
  const uploadResult = await FileUploadService.uploadAnswerSheet(
    req.file,
    submission.exam.toString(),
    studentId.toString()
  );

  // 5. Delete old answer sheet if exists
  if (submission.answerSheetUrl) {
    await FileUploadService.deleteFile(submission.answerSheetUrl);
  }

  // 6. Update submission with new URL
  submission.answerSheetUrl = uploadResult.url;
  await submission.save();

  // Log audit event for answer sheet upload
  try {
    await auditLogService.logAuditEvent({
      userId: studentId,
      action: 'answer_sheet_uploaded',
      resource: 'answer_sheet',
      resourceId: submission._id,
      details: {
        examId: submission.exam,
        filename: uploadResult.filename || req.file.originalname,
        fileSize: uploadResult.size || req.file.size
      },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent') || 'unknown'
    });
  } catch (auditError) {
    console.error('Error logging audit event:', auditError);
  }

  // 7. Return file URL
  res.json({
    success: true,
    message: 'Answer sheet uploaded',
    answerSheetUrl: uploadResult.url
  });
});

/**
 * @desc    Submit exam (finalize submission)
 * @route   POST /api/exam-submissions/:submissionId/submit
 * @access  Private (Student)
 * 
 * Requirements: 6.7, 6.8, 6.9, 15.5, 15.7
 */
const submitExam = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const { isAutoSubmit = false } = req.body;
  const studentId = req.user._id;

  // 1. Find submission and validate ownership
  const submission = await ExamSubmissionNew.findById(submissionId)
    .populate('exam');
  
  if (!submission) {
    res.status(404);
    throw new Error('Submission not found');
  }

  if (submission.student.toString() !== studentId.toString()) {
    res.status(403);
    throw new Error('Not authorized to submit this exam');
  }

  // 2. Validate status is in-progress
  if (submission.status !== 'in-progress') {
    res.status(400);
    throw new Error('Exam already submitted');
  }

  // 3. Set submittedAt to current timestamp
  submission.submittedAt = new Date();

  // 4. Calculate timeSpent (submittedAt - startedAt) in seconds
  submission.timeSpent = Math.floor(
    (submission.submittedAt - submission.startedAt) / 1000
  );

  // 5. Set isAutoSubmitted
  submission.isAutoSubmitted = isAutoSubmit;

  // 6. Change status to 'submitted'
  submission.status = 'submitted';

  await submission.save();

  // 7. Trigger auto-grading if exam is online-mcq type
  let autoGradedMarks = null;
  if (submission.exam.examType === 'online-mcq') {
    // Call auto-grading service
    const autoGradingService = require('../services/autoGradingService');
    try {
      autoGradedMarks = await autoGradingService.autoGradeMCQSubmission(submission._id);
    } catch (error) {
      console.error('Error auto-grading submission:', error);
      // Don't fail the submission if auto-grading fails
    }
  }

  // 8. Send confirmation notification to student
  // Use existing notification service
  // await NotificationService.notifySubmissionReceived(submission, studentId);

  // Log audit event for exam submission
  try {
    await auditLogService.logAuditEvent({
      userId: studentId,
      action: isAutoSubmit ? 'exam_submitted_auto' : 'exam_submitted_manual',
      resource: 'submission',
      resourceId: submission._id,
      details: {
        examId: submission.exam._id,
        examTitle: submission.exam.title,
        timeSpent: submission.timeSpent,
        isAutoSubmitted: isAutoSubmit
      },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent') || 'unknown'
    });
  } catch (auditError) {
    console.error('Error logging audit event:', auditError);
  }

  // 9. Return updated submission
  res.json({
    success: true,
    message: isAutoSubmit ? 'Exam auto-submitted' : 'Exam submitted successfully',
    submission,
    autoGradedMarks
  });
});

module.exports = {
  submitAnswer,
  uploadAnswerSheet,
  submitExam
};

/**
 * @desc    Get all submissions for an exam (for grading)
 * @route   GET /api/submissions/exam/:examId
 * @access  Private (University/Admin)
 * 
 * Requirements: 9.1, 18.1, 18.3
 */
const getSubmissionsForExam = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const { status, sortBy = 'submittedAt', page = 1, limit = 20 } = req.query;
  
  // 1. Verify exam exists and check authorization
  const exam = await Exam.findById(examId);
  if (!exam) {
    res.status(404);
    throw new Error('Exam not found');
  }
  
  const userRole = req.user.role?.toLowerCase();
  if (userRole !== 'admin' && exam.university.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to view submissions for this exam');
  }
  
  // 2. Build query filter
  const filter = { exam: examId };
  
  // Filter by status if provided
  if (status) {
    if (status === 'submitted' || status === 'graded') {
      filter.status = status;
    } else {
      filter.status = { $in: ['submitted', 'graded'] };
    }
  } else {
    // Default: show submitted and graded submissions
    filter.status = { $in: ['submitted', 'graded'] };
  }
  
  // 3. Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  // 4. Fetch submissions with pagination and selective population
  const submissions = await ExamSubmissionNew.find(filter)
    .populate('student', 'name email') // Only populate name and email
    .select('student exam status submittedAt obtainedMarks totalMarks percentage isAutoSubmitted gradedAt') // Select only needed fields
    .sort({ [sortBy]: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean(); // Use lean() for better performance
  
  // 5. Get total count for pagination metadata
  const totalCount = await ExamSubmissionNew.countDocuments(filter);
  
  // 6. Return submissions with metadata
  res.json({
    success: true,
    submissions,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      totalCount,
      limit: parseInt(limit)
    }
  });
});

/**
 * @desc    Grade a submission manually
 * @route   POST /api/submissions/:submissionId/grade
 * @access  Private (University/Admin)
 * 
 * Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10
 */
const gradeSubmission = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const { answers, overallFeedback } = req.body;
  
  // 1. Find submission and populate exam
  const submission = await ExamSubmissionNew.findById(submissionId)
    .populate('exam')
    .populate('answers.question');
  
  if (!submission) {
    res.status(404);
    throw new Error('Submission not found');
  }
  
  // 2. Check authorization
  const userRole = req.user.role?.toLowerCase();
  if (userRole !== 'admin' && submission.exam.university.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to grade this submission');
  }
  
  // 3. Validate submission status
  if (submission.status !== 'submitted' && submission.status !== 'graded') {
    res.status(400);
    throw new Error('Can only grade submitted submissions');
  }
  
  // 4. Validate all questions have marksAwarded
  if (!answers || !Array.isArray(answers)) {
    res.status(400);
    throw new Error('Answers array is required');
  }
  
  // Create a map of questionId -> grading data
  const gradingMap = new Map();
  answers.forEach(answer => {
    if (answer.questionId && answer.marksAwarded !== undefined) {
      gradingMap.set(answer.questionId, {
        marksAwarded: answer.marksAwarded,
        feedback: answer.feedback || ''
      });
    }
  });
  
  // 5. Update each answer with marksAwarded and feedback
  let obtainedMarks = 0;
  
  for (let i = 0; i < submission.answers.length; i++) {
    const answer = submission.answers[i];
    const questionId = answer.question._id.toString();
    const gradingData = gradingMap.get(questionId);
    
    if (gradingData) {
      // Validate marksAwarded is within valid range
      const maxMarks = answer.question.marks;
      if (gradingData.marksAwarded < 0 || gradingData.marksAwarded > maxMarks) {
        res.status(400);
        throw new Error(`Marks awarded for question ${questionId} must be between 0 and ${maxMarks}`);
      }
      
      answer.marksAwarded = gradingData.marksAwarded;
      answer.feedback = gradingData.feedback;
      obtainedMarks += gradingData.marksAwarded;
    } else if (answer.questionType === 'descriptive') {
      // Descriptive questions must have marks awarded
      res.status(400);
      throw new Error(`Missing marks for question ${questionId}`);
    } else if (answer.questionType === 'mcq' && answer.marksAwarded !== undefined) {
      // MCQ already graded, include in total
      obtainedMarks += answer.marksAwarded;
    }
  }
  
  // 6. Calculate total obtainedMarks and percentage
  submission.obtainedMarks = obtainedMarks;
  submission.totalMarks = submission.exam.totalMarks;
  submission.percentage = (obtainedMarks / submission.totalMarks) * 100;
  
  // 7. Set status to 'graded'
  submission.status = 'graded';
  
  // 8. Record gradedBy and gradedAt
  submission.gradedBy = req.user._id;
  submission.gradedAt = new Date();
  
  await submission.save();
  
  // 9. Generate result for this exam (will create/update result for all graded submissions)
  const resultService = require('../services/resultService');
  await resultService.generateExamResults(submission.exam._id);

  // Log audit event for manual grading
  try {
    await auditLogService.logAuditEvent({
      userId: req.user._id,
      action: 'submission_graded',
      resource: 'submission',
      resourceId: submission._id,
      details: {
        examId: submission.exam._id,
        studentId: submission.student,
        obtainedMarks: submission.obtainedMarks,
        totalMarks: submission.totalMarks,
        percentage: submission.percentage
      },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent') || 'unknown'
    });
  } catch (auditError) {
    console.error('Error logging audit event:', auditError);
  }
  
  // 10. Return graded submission
  res.json({
    success: true,
    message: 'Submission graded successfully',
    submission
  });
});

/**
 * @desc    Get my submission for an exam
 * @route   GET /api/exam-submissions/exam/:examId/my-submission
 * @access  Private (Student)
 * 
 * Requirements: 5.7
 */
const getMySubmission = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const studentId = req.user._id;
  
  // 1. Fetch submission for requesting student with selective population
  const submission = await ExamSubmissionNew.findOne({
    exam: examId,
    student: studentId
  })
    .populate('exam', 'title examType totalMarks duration scheduledEndTime') // Only populate needed exam fields
    .populate({
      path: 'answers.question',
      select: 'questionText questionType options marks negativeMarks order' // Only select needed question fields
    });
  
  if (!submission) {
    res.status(404);
    throw new Error('Submission not found');
  }
  
  // 2. Return submission with answers
  res.json({
    success: true,
    submission
  });
});

module.exports = {
  submitAnswer,
  uploadAnswerSheet,
  submitExam,
  getSubmissionsForExam,
  gradeSubmission,
  getMySubmission
};
