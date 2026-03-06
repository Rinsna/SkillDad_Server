const Exam = require('../models/examModel');
const ExamSubmission = require('../models/examSubmissionModel');
const ExamSubmissionNew = require('../models/examSubmissionNewModel');
const Question = require('../models/questionModel');
const Result = require('../models/resultModel');
const Enrollment = require('../models/enrollmentModel');
const FileUploadService = require('../services/FileUploadService');
const NotificationService = require('../services/NotificationService');
const ExamNotificationService = require('../services/ExamNotificationService');
const examAccessService = require('../services/examAccessService');
const auditLogService = require('../services/auditLogService');
const { invalidateExamCache } = require('../middleware/cacheMiddleware');

/**
 * Exam Controller
 * Handles exam CRUD operations and file upload operations
 */

// ============================================
// ADMIN EXAM MANAGEMENT FUNCTIONS
// ============================================

/**
 * @desc    Schedule a new exam (Admin)
 * @route   POST /api/exams
 * @access  Private (Admin)
 */
const scheduleExam = async (req, res) => {
  try {
    const {
      title,
      description,
      course,
      university,
      examType,
      scheduledStartTime,
      scheduledEndTime,
      duration,
      totalMarks,
      isMockExam,
      allowLateSubmission,
      lateSubmissionDeadline,
      passingScore,
      shuffleQuestions,
      showResultsImmediately,
      instructions,
    } = req.body;

    // Validate required fields
    if (!title || !course || !university || !examType || !scheduledStartTime || !scheduledEndTime || !duration || !totalMarks) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, course, university, examType, scheduledStartTime, scheduledEndTime, duration, totalMarks',
      });
    }

    // Validate exam type
    const validExamTypes = ['pdf-based', 'online-mcq', 'online-descriptive', 'mixed'];
    if (!validExamTypes.includes(examType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid exam type. Must be one of: ${validExamTypes.join(', ')}`,
      });
    }

    // Validate time window
    const startTime = new Date(scheduledStartTime);
    const endTime = new Date(scheduledEndTime);

    if (endTime <= startTime) {
      return res.status(400).json({
        success: false,
        message: 'scheduledEndTime must be after scheduledStartTime',
      });
    }

    // Validate duration fits within time window
    const timeWindowMinutes = (endTime - startTime) / (1000 * 60);
    if (duration > timeWindowMinutes) {
      return res.status(400).json({
        success: false,
        message: 'duration must fit within the time window between start and end times',
      });
    }

    // Validate late submission deadline if provided
    if (allowLateSubmission && lateSubmissionDeadline) {
      const lateDeadline = new Date(lateSubmissionDeadline);
      if (lateDeadline <= endTime) {
        return res.status(400).json({
          success: false,
          message: 'lateSubmissionDeadline must be after scheduledEndTime',
        });
      }
    }

    // Create exam
    const exam = await Exam.create({
      title,
      description,
      course,
      university,
      createdBy: req.user._id,
      examType,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      duration,
      totalMarks,
      isMockExam: isMockExam || false,
      allowLateSubmission: allowLateSubmission || false,
      lateSubmissionDeadline: allowLateSubmission ? lateSubmissionDeadline : null,
      passingScore: passingScore || 40,
      shuffleQuestions: shuffleQuestions || false,
      showResultsImmediately: showResultsImmediately || false,
      instructions,
      status: 'scheduled',
    });

    // Populate course and university details
    await exam.populate('course', 'title');
    await exam.populate('university', 'name email');

    // Send notifications to enrolled students
    try {
      await ExamNotificationService.notifyExamScheduled(exam);
      console.log(`Sent exam scheduled notifications for exam: ${exam.title}`);
    } catch (notificationError) {
      console.error('Error sending notifications:', notificationError);
      // Don't fail the request if notifications fail
    }

    // Log audit event for exam creation
    try {
      await auditLogService.logAuditEvent({
        userId: req.user._id,
        action: 'exam_created',
        resource: 'exam',
        resourceId: exam._id,
        details: {
          examTitle: exam.title,
          examType: exam.examType,
          course: exam.course,
          university: exam.university,
          scheduledStartTime: exam.scheduledStartTime,
          totalMarks: exam.totalMarks
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('Error logging audit event:', auditError);
      // Don't fail the request if audit logging fails
    }

    res.status(201).json({
      success: true,
      message: 'Exam scheduled successfully',
      data: exam,
    });
  } catch (error) {
    console.error('Error scheduling exam:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to schedule exam',
    });
  }
};

/**
 * @desc    Update exam details (Admin)
 * @route   PUT /api/exams/:examId
 * @access  Private (Admin)
 */
const updateExam = async (req, res) => {
  try {
    const { examId } = req.params;
    const updates = req.body;

    // Find exam
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found',
      });
    }

    // Ownership verification: Universities can only update their own exams
    const userRole = req.user.role?.toLowerCase();
    if (userRole === 'university' && exam.university.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this exam',
      });
    }

    // Validate time window if being updated
    if (updates.scheduledStartTime || updates.scheduledEndTime) {
      const startTime = new Date(updates.scheduledStartTime || exam.scheduledStartTime);
      const endTime = new Date(updates.scheduledEndTime || exam.scheduledEndTime);

      if (endTime <= startTime) {
        return res.status(400).json({
          success: false,
          message: 'scheduledEndTime must be after scheduledStartTime',
        });
      }

      // Validate duration fits within time window
      const duration = updates.duration || exam.duration;
      const timeWindowMinutes = (endTime - startTime) / (1000 * 60);
      if (duration > timeWindowMinutes) {
        return res.status(400).json({
          success: false,
          message: 'duration must fit within the time window between start and end times',
        });
      }
    }

    // Validate exam type if being updated
    if (updates.examType) {
      const validExamTypes = ['pdf-based', 'online-mcq', 'online-descriptive', 'mixed'];
      if (!validExamTypes.includes(updates.examType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid exam type. Must be one of: ${validExamTypes.join(', ')}`,
        });
      }
    }

    // Validate late submission deadline if being updated
    if (updates.allowLateSubmission && updates.lateSubmissionDeadline) {
      const endTime = new Date(updates.scheduledEndTime || exam.scheduledEndTime);
      const lateDeadline = new Date(updates.lateSubmissionDeadline);
      if (lateDeadline <= endTime) {
        return res.status(400).json({
          success: false,
          message: 'lateSubmissionDeadline must be after scheduledEndTime',
        });
      }
    }

    // Update exam
    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) {
        exam[key] = updates[key];
      }
    });

    await exam.save();

    // Invalidate cache for this exam
    await invalidateExamCache(examId);

    // Populate references
    await exam.populate('course', 'title');
    await exam.populate('university', 'name email');

    // Log audit event for exam update
    try {
      await auditLogService.logAuditEvent({
        userId: req.user._id,
        action: 'exam_updated',
        resource: 'exam',
        resourceId: exam._id,
        details: {
          examTitle: exam.title,
          updatedFields: Object.keys(updates)
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('Error logging audit event:', auditError);
    }

    res.status(200).json({
      success: true,
      message: 'Exam updated successfully',
      data: exam,
    });
  } catch (error) {
    console.error('Error updating exam:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update exam',
    });
  }
};

/**
 * @desc    Delete exam and all associated resources (Admin)
 * @route   DELETE /api/exams/:examId
 * @access  Private (Admin)
 */
const deleteExam = async (req, res) => {
  try {
    const { examId } = req.params;

    // Find exam
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found',
      });
    }

    // Ownership verification: Universities can only delete their own exams
    const userRole = req.user.role?.toLowerCase();
    if (userRole === 'university' && exam.university.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this exam',
      });
    }

    // Delete associated questions
    const deletedQuestions = await Question.deleteMany({ exam: examId });

    // Delete associated submissions
    const deletedSubmissions = await ExamSubmission.deleteMany({ exam: examId });

    // Delete associated results
    const deletedResults = await Result.deleteMany({ exam: examId });

    // Delete associated files (question papers and answer sheets)
    const filesDeletionResult = await FileUploadService.deleteExamFiles(examId);

    // Delete the exam itself
    await Exam.findByIdAndDelete(examId);

    // Invalidate cache for this exam
    await invalidateExamCache(examId);

    // Log audit event for exam deletion
    try {
      await auditLogService.logAuditEvent({
        userId: req.user._id,
        action: 'exam_deleted',
        resource: 'exam',
        resourceId: examId,
        details: {
          examTitle: exam.title,
          deletedQuestions: deletedQuestions.deletedCount,
          deletedSubmissions: deletedSubmissions.deletedCount,
          deletedResults: deletedResults.deletedCount
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('Error logging audit event:', auditError);
    }

    res.status(200).json({
      success: true,
      message: 'Exam and all associated resources deleted successfully',
      data: {
        deletedQuestions: deletedQuestions.deletedCount,
        deletedSubmissions: deletedSubmissions.deletedCount,
        deletedResults: deletedResults.deletedCount,
        deletedFiles: filesDeletionResult.deletedCount,
      },
    });
  } catch (error) {
    console.error('Error deleting exam:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete exam',
    });
  }
};

/**
 * @desc    Get all exams with filtering and pagination (Admin)
 * @route   GET /api/exams
 * @access  Private (Admin)
 */
const getAllExams = async (req, res) => {
  try {
    const {
      status,
      university,
      course,
      isMockExam,
      page = 1,
      limit = 10,
      sortBy = 'scheduledStartTime',
      sortOrder = 'desc',
    } = req.query;

    // Build filter query
    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (university) {
      filter.university = university;
    }

    if (course) {
      filter.course = course;
    }

    if (isMockExam !== undefined) {
      filter.isMockExam = isMockExam === 'true';
    }

    // Calculate pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination and selective population
    const exams = await Exam.find(filter)
      .populate('course', 'title') // Only populate title for course
      .populate('university', 'name email profile') // Populate name, email, and profile for university
      .populate('createdBy', 'name email') // Only populate name and email for creator
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean(); // Use lean() for better performance when not modifying documents

    // Get total count for pagination
    const totalExams = await Exam.countDocuments(filter);
    const totalPages = Math.ceil(totalExams / limitNum);

    res.status(200).json({
      success: true,
      data: exams,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalExams,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching exams:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch exams',
    });
  }
};

// ============================================
// FILE UPLOAD FUNCTIONS
// ============================================


/**
 * @desc    Upload question paper for PDF-based exam
 * @route   POST /api/exams/:examId/question-paper
 * @access  Private (University/Admin)
 */
const uploadQuestionPaper = async (req, res) => {
  try {
    const { examId } = req.params;

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Find exam
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found',
      });
    }

    // Check authorization
    const userRole = req.user.role?.toLowerCase();
    if (userRole !== 'admin' && exam.university.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload question paper for this exam',
      });
    }

    // Validate exam type
    if (exam.examType !== 'pdf-based' && exam.examType !== 'mixed') {
      return res.status(400).json({
        success: false,
        message: 'Question paper upload is only allowed for pdf-based or mixed exams',
      });
    }

    // Delete old question paper if exists
    if (exam.questionPaperUrl) {
      await FileUploadService.deleteFile(exam.questionPaperUrl);
    }

    // Upload new question paper
    const uploadResult = await FileUploadService.uploadQuestionPaper(
      req.file,
      examId
    );

    // Update exam with new question paper URL
    exam.questionPaperUrl = uploadResult.url;
    await exam.save();

    // Log audit event for question paper upload
    try {
      await auditLogService.logAuditEvent({
        userId: req.user._id,
        action: 'question_paper_uploaded',
        resource: 'question_paper',
        resourceId: exam._id,
        details: {
          examTitle: exam.title,
          filename: uploadResult.filename,
          fileSize: uploadResult.size
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('Error logging audit event:', auditError);
    }

    res.status(200).json({
      success: true,
      message: 'Question paper uploaded successfully',
      data: {
        questionPaperUrl: uploadResult.url,
        filename: uploadResult.filename,
        size: uploadResult.size,
      },
    });
  } catch (error) {
    console.error('Error uploading question paper:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload question paper',
    });
  }
};

/**
 * @desc    Get secure download URL for question paper
 * @route   GET /api/exams/:examId/question-paper/download
 * @access  Private (Student/University/Admin)
 */
const getQuestionPaperDownloadUrl = async (req, res) => {
  try {
    const { examId } = req.params;

    // Find exam
    const exam = await Exam.findById(examId).populate('course', 'title');
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found',
      });
    }

    if (!exam.questionPaperUrl) {
      return res.status(404).json({
        success: false,
        message: 'No question paper available for this exam',
      });
    }

    // Check access permissions
    const userRole = req.user.role?.toLowerCase();
    const now = new Date();
    const scheduledStart = new Date(exam.scheduledStartTime);
    const scheduledEnd = new Date(exam.scheduledEndTime);

    // Admin and university can always access
    if (userRole !== 'admin' && userRole !== 'university') {
      // Students must be within exam time window
      if (now < scheduledStart) {
        const minutesUntilStart = Math.round((scheduledStart - now) / 60000);
        return res.status(403).json({
          success: false,
          message: `Exam has not started yet. Starts in ${minutesUntilStart} minute(s)`,
          availableAt: exam.scheduledStartTime,
        });
      }

      const effectiveEndTime = exam.allowLateSubmission && exam.lateSubmissionDeadline
        ? new Date(exam.lateSubmissionDeadline)
        : scheduledEnd;

      if (now > effectiveEndTime) {
        return res.status(403).json({
          success: false,
          message: 'Exam time window has expired',
          expiredAt: effectiveEndTime,
        });
      }

      // Verify student enrollment
      const Enrollment = require('../models/enrollmentModel');
      const enrollment = await Enrollment.findOne({
        student: req.user._id,
        course: exam.course._id,
        status: 'active',
      });

      if (!enrollment) {
        return res.status(403).json({
          success: false,
          message: 'You are not enrolled in this course',
        });
      }
    }

    // Generate secure URL
    const secureUrl = await FileUploadService.generateSecureUrl(
      exam.questionPaperUrl,
      3600 // 1 hour expiry
    );

    res.status(200).json({
      success: true,
      data: {
        url: secureUrl.url,
        expiresAt: secureUrl.expiresAt,
        examTitle: exam.title,
        courseTitle: exam.course?.title,
      },
    });
  } catch (error) {
    console.error('Error generating question paper download URL:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate download URL',
    });
  }
};

/**
 * @desc    Upload answer sheet for PDF-based exam submission
 * @route   POST /api/exams/:examId/submissions/:submissionId/answer-sheet
 * @access  Private (Student)
 */
const uploadAnswerSheet = async (req, res) => {
  try {
    const { examId, submissionId } = req.params;

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Find submission
    const submission = await ExamSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found',
      });
    }

    // Verify submission belongs to the user
    if (submission.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload answer sheet for this submission',
      });
    }

    // Verify submission is for the correct exam
    if (submission.exam.toString() !== examId) {
      return res.status(400).json({
        success: false,
        message: 'Submission does not belong to this exam',
      });
    }

    // Check submission status
    if (submission.status !== 'in-progress') {
      return res.status(400).json({
        success: false,
        message: 'Cannot upload answer sheet for a submitted exam',
      });
    }

    // Delete old answer sheet if exists
    if (submission.answerSheetUrl) {
      await FileUploadService.deleteFile(submission.answerSheetUrl);
    }

    // Upload new answer sheet
    const uploadResult = await FileUploadService.uploadAnswerSheet(
      req.file,
      examId,
      req.user._id.toString()
    );

    // Update submission with answer sheet URL
    submission.answerSheetUrl = uploadResult.url;
    await submission.save();

    res.status(200).json({
      success: true,
      message: 'Answer sheet uploaded successfully',
      data: {
        answerSheetUrl: uploadResult.url,
        filename: uploadResult.filename,
        size: uploadResult.size,
      },
    });
  } catch (error) {
    console.error('Error uploading answer sheet:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload answer sheet',
    });
  }
};

/**
 * @desc    Get secure download URL for answer sheet
 * @route   GET /api/exams/:examId/submissions/:submissionId/answer-sheet/download
 * @access  Private (Student/University/Admin)
 */
const getAnswerSheetDownloadUrl = async (req, res) => {
  try {
    const { examId, submissionId } = req.params;

    // Find submission
    const submission = await ExamSubmission.findById(submissionId)
      .populate('exam', 'title university')
      .populate('student', 'name email');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found',
      });
    }

    if (!submission.answerSheetUrl) {
      return res.status(404).json({
        success: false,
        message: 'No answer sheet available for this submission',
      });
    }

    // Check authorization
    const userRole = req.user.role?.toLowerCase();
    const isStudent = submission.student._id.toString() === req.user._id.toString();
    const isUniversity = submission.exam.university.toString() === req.user._id.toString();

    if (userRole !== 'admin' && !isStudent && !isUniversity) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this answer sheet',
      });
    }

    // Generate secure URL
    const secureUrl = await FileUploadService.generateSecureUrl(
      submission.answerSheetUrl,
      3600 // 1 hour expiry
    );

    res.status(200).json({
      success: true,
      data: {
        url: secureUrl.url,
        expiresAt: secureUrl.expiresAt,
        studentName: submission.student.name,
        examTitle: submission.exam.title,
      },
    });
  } catch (error) {
    console.error('Error generating answer sheet download URL:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate download URL',
    });
  }
};

/**
 * @desc    Delete exam and all associated files
 * @route   DELETE /api/exams/:examId/files
 * @access  Private (Admin)
 */
const deleteExamFiles = async (req, res) => {
  try {
    const { examId } = req.params;

    // Check authorization (admin only)
    if (req.user.role?.toLowerCase() !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can delete exam files',
      });
    }

    // Delete all files associated with the exam
    const result = await FileUploadService.deleteExamFiles(examId);

    res.status(200).json({
      success: true,
      message: 'Exam files deleted successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error deleting exam files:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete exam files',
    });
  }
};

/**
 * @desc    Get exams for courses student is enrolled in
 * @route   GET /api/exams/student/my-exams
 * @access  Private (Student)
 */
const getStudentExams = async (req, res) => {
  try {
    const studentId = req.user._id;

    // Get courses the student is enrolled in
    const enrollments = await Enrollment.find({
      student: studentId,
      status: 'active',
    }).select('course');

    const courseIds = enrollments.map((e) => e.course);

    // Fetch exams for these courses with selective population
    const exams = await Exam.find({
      course: { $in: courseIds },
    })
      .populate('course', 'title') // Only populate title
      .populate('university', 'name') // Only populate name
      .sort({ scheduledStartTime: -1 })
      .lean(); // Use lean() for better performance

    // Get student's submissions for these exams with minimal fields
    const submissions = await ExamSubmissionNew.find({
      exam: { $in: exams.map((e) => e._id) },
      student: studentId,
    })
      .select('exam status submittedAt obtainedMarks totalMarks percentage') // Only select needed fields
      .lean();

    // Combine exam data with submission status
    const examsWithStatus = exams.map((exam) => {
      const submission = submissions.find(
        (s) => s.exam.toString() === exam._id.toString()
      );

      return {
        ...exam, // Already a plain object from lean()
        submission: submission || null,
        hasSubmitted: submission && submission.status !== 'in-progress',
      };
    });

    res.status(200).json({
      success: true,
      count: examsWithStatus.length,
      data: examsWithStatus,
    });
  } catch (error) {
    console.error('Error fetching student exams:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch student exams',
    });
  }
};

/**
 * @desc    Check if student can access exam
 * @route   GET /api/exams/:examId/access
 * @access  Private (Student)
 */
const checkExamAccessController = async (req, res) => {
  try {
    const { examId } = req.params;
    const studentId = req.user._id;

    // Call the exam access service
    const accessResult = await examAccessService.checkExamAccess(
      examId,
      studentId
    );

    res.status(200).json({
      success: true,
      data: accessResult,
    });
  } catch (error) {
    console.error('Error checking exam access:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check exam access',
    });
  }
};

/**
 * @desc    Start exam for student
 * @route   POST /api/exams/:examId/start
 * @access  Private (Student)
 */
const startExam = async (req, res) => {
  try {
    const { examId } = req.params;
    const studentId = req.user._id;

    // Check exam access
    const accessResult = await examAccessService.checkExamAccess(
      examId,
      studentId
    );

    // Log exam access attempt
    try {
      await auditLogService.logAuditEvent({
        userId: studentId,
        action: accessResult.canAccess ? 'exam_access_granted' : 'exam_access_denied',
        resource: 'exam',
        resourceId: examId,
        details: {
          reason: accessResult.reason,
          timeRemaining: accessResult.timeRemaining
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('Error logging audit event:', auditError);
    }

    if (!accessResult.canAccess) {
      return res.status(403).json({
        success: false,
        message: accessResult.reason,
        data: {
          canAccess: false,
          reason: accessResult.reason,
          startsAt: accessResult.startsAt,
        },
      });
    }

    const exam = accessResult.exam;

    // Check for existing in-progress submission (resume)
    let submission = await ExamSubmissionNew.findOne({
      exam: examId,
      student: studentId,
      status: 'in-progress',
    });

    // If no in-progress submission, create a new one
    if (!submission) {
      submission = new ExamSubmissionNew({
        exam: examId,
        student: studentId,
        startedAt: new Date(),
        status: 'in-progress',
        totalMarks: exam.totalMarks,
      });

      await submission.save();

      // Log audit event for exam started
      try {
        await auditLogService.logAuditEvent({
          userId: studentId,
          action: 'exam_started',
          resource: 'exam',
          resourceId: examId,
          details: {
            examTitle: exam.title,
            submissionId: submission._id
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent') || 'unknown'
        });
      } catch (auditError) {
        console.error('Error logging audit event:', auditError);
      }
    }

    // Prepare response based on exam type
    let responseData = {
      submission: submission,
      exam: {
        _id: exam._id,
        title: exam.title,
        description: exam.description,
        examType: exam.examType,
        duration: exam.duration,
        totalMarks: exam.totalMarks,
        instructions: exam.instructions,
        shuffleQuestions: exam.shuffleQuestions,
      },
      timeRemaining: accessResult.timeRemaining,
    };

    // For PDF-based exams, provide question paper URL
    if (exam.examType === 'pdf-based') {
      if (!exam.questionPaperUrl) {
        return res.status(400).json({
          success: false,
          message: 'Question paper not available for this exam',
        });
      }

      // Generate secure download URL
      const downloadUrl = await FileUploadService.generateSecureUrl(
        exam.questionPaperUrl,
        3600 // 1 hour expiry
      );

      responseData.questionPaperUrl = downloadUrl;
    }

    // For online exams, fetch and return questions
    if (
      exam.examType === 'online-mcq' ||
      exam.examType === 'online-descriptive' ||
      exam.examType === 'mixed'
    ) {
      let questions = await Question.find({ exam: examId }).sort({ order: 1 });

      // Process questions with integrity measures (shuffling, option randomization)
      const examIntegrityService = require('../services/examIntegrityService');
      const processedQuestions = examIntegrityService.processQuestionsForDelivery(
        questions,
        {
          shuffleQuestions: exam.shuffleQuestions
        }
      );

      responseData.questions = processedQuestions;
    }

    res.status(200).json({
      success: true,
      message: submission.createdAt < submission.updatedAt
        ? 'Resuming exam'
        : 'Exam started successfully',
      data: responseData,
    });
  } catch (error) {
    console.error('Error starting exam:', error);

    // Handle duplicate submission error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'You have already started this exam',
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to start exam',
    });
  }
};
/**
 * @desc    Auto-grade all MCQ submissions for an exam
 * @route   POST /api/exams/:examId/auto-grade
 * @access  Private (University/Admin)
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 */
const autoGradeExam = async (req, res) => {
  try {
    const { examId } = req.params;

    // 1. Verify exam exists
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found',
      });
    }

    // 2. Check authorization
    const userRole = req.user.role?.toLowerCase();
    if (userRole !== 'admin' && exam.university.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to grade this exam',
      });
    }

    // 3. Verify exam type supports auto-grading
    if (exam.examType !== 'online-mcq' && exam.examType !== 'mixed') {
      return res.status(400).json({
        success: false,
        message: 'Auto-grading only available for online-mcq or mixed exams',
      });
    }

    // 4. Fetch all submitted submissions for exam
    const submissions = await ExamSubmissionNew.find({
      exam: examId,
      status: 'submitted'
    });

    if (submissions.length === 0) {
      return res.json({
        success: true,
        message: 'No submissions to grade',
        gradedCount: 0,
        results: []
      });
    }

    // 5. Grade each submission
    const autoGradingService = require('../services/autoGradingService');
    const results = [];
    let gradedCount = 0;

    for (const submission of submissions) {
      try {
        const gradingResult = await autoGradingService.autoGradeMCQSubmission(submission._id);
        results.push(gradingResult);
        gradedCount++;
      } catch (error) {
        console.error(`Error grading submission ${submission._id}:`, error);
        results.push({
          submissionId: submission._id,
          error: error.message
        });
      }
    }

    // 6. Log audit event for auto-grading
    try {
      await auditLogService.logAuditEvent({
        userId: req.user._id,
        action: 'exam_auto_graded',
        resource: 'exam',
        resourceId: examId,
        details: {
          examTitle: exam.title,
          gradedCount,
          totalSubmissions: submissions.length
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('Error logging audit event:', auditError);
    }

    // 7. Return summary
    res.json({
      success: true,
      message: `Auto-graded ${gradedCount} submissions`,
      gradedCount,
      totalSubmissions: submissions.length,
      results
    });
  } catch (error) {
    console.error('Error auto-grading exam:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to auto-grade exam',
    });
  }
};



module.exports = {
  // Admin exam management
  scheduleExam,
  updateExam,
  deleteExam,
  getAllExams,
  // File upload operations
  uploadQuestionPaper,
  getQuestionPaperDownloadUrl,
  uploadAnswerSheet,
  getAnswerSheetDownloadUrl,
  deleteExamFiles,
  // Student exam access
  getStudentExams,
  checkExamAccessController,
  startExam,
  // Auto-grading
  autoGradeExam,
};
