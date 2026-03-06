const asyncHandler = require('express-async-handler');
const ExamSubmissionNew = require('../models/examSubmissionNewModel');
const Exam = require('../models/examModel');
const Result = require('../models/resultModel');
const resultService = require('../services/resultService');
const auditLogService = require('../services/auditLogService');
const mongoose = require('mongoose');

/**
 * @desc    Publish results for an exam
 * @route   POST /api/exams/:examId/publish-results
 * @access  Private (University/Admin)
 */
const publishResults = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  
  // 1. Verify exam exists and check authorization
  const exam = await Exam.findById(examId);
  if (!exam) {
    res.status(404);
    throw new Error('Exam not found');
  }
  
  const userRole = req.user.role?.toLowerCase();
  if (userRole !== 'admin' && exam.university.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to publish results for this exam');
  }
  
  // 2. Check if all submissions are graded
  const totalSubmissions = await ExamSubmissionNew.countDocuments({ exam: examId });
  const gradedSubmissions = await ExamSubmissionNew.countDocuments({ 
    exam: examId, 
    status: 'graded' 
  });
  
  if (gradedSubmissions < totalSubmissions) {
    res.status(400);
    throw new Error(`Cannot publish results. ${totalSubmissions - gradedSubmissions} submissions are not yet graded.`);
  }
  
  // 3. Generate results if not already generated
  await resultService.generateExamResults(examId);
  
  // 4. Set isPublished to true for all results
  const publishedAt = new Date();
  const updateResult = await Result.updateMany(
    { exam: examId },
    { 
      isPublished: true,
      publishedAt
    }
  );
  
  // 5. Update exam status to 'published'
  exam.status = 'published';
  exam.resultsPublished = true;
  exam.publishedAt = publishedAt;
  await exam.save();
  
  // 6. Send notification to each student (placeholder for Task 15)
  // const results = await Result.find({ exam: examId }).populate('student');
  // for (const result of results) {
  //   await NotificationService.notifyResultPublished(exam, result.student, result);
  // }

  // Log audit event for result publication
  try {
    await auditLogService.logAuditEvent({
      userId: req.user._id,
      action: 'results_published',
      resource: 'result',
      resourceId: examId,
      details: {
        examTitle: exam.title,
        publishedCount: updateResult.modifiedCount
      },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent') || 'unknown'
    });
  } catch (auditError) {
    console.error('Error logging audit event:', auditError);
  }
  
  // 7. Return count of published results
  res.json({
    success: true,
    message: 'Results published successfully',
    publishedCount: updateResult.modifiedCount,
    publishedAt
  });
});

/**
 * @desc    Get all results for an exam with statistics
 * @route   GET /api/results/exam/:examId
 * @access  Private (University/Admin)
 */
const getExamResults = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  
  // 1. Verify exam exists and check authorization
  const exam = await Exam.findById(examId);
  if (!exam) {
    res.status(404);
    throw new Error('Exam not found');
  }
  
  const userRole = req.user.role?.toLowerCase();
  if (userRole !== 'admin' && exam.university.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to view results for this exam');
  }
  
  // 2. Fetch all results for exam with selective population
  const results = await Result.find({ exam: examId })
    .populate('student', 'name email') // Only populate name and email
    .select('student obtainedMarks totalMarks percentage grade isPassed rank') // Select only needed fields
    .sort({ rank: 1 })
    .lean(); // Use lean() for better performance
  
  // 3. Calculate statistics using aggregation
  const stats = await Result.aggregate([
    { $match: { exam: mongoose.Types.ObjectId(examId) } },
    {
      $group: {
        _id: null,
        averageScore: { $avg: '$obtainedMarks' },
        averagePercentage: { $avg: '$percentage' },
        minScore: { $min: '$obtainedMarks' },
        maxScore: { $max: '$obtainedMarks' },
        totalStudents: { $sum: 1 },
        passedStudents: {
          $sum: { $cond: ['$isPassed', 1, 0] }
        }
      }
    }
  ]);
  
  const statistics = stats.length > 0 ? stats[0] : {
    averageScore: 0,
    averagePercentage: 0,
    minScore: 0,
    maxScore: 0,
    totalStudents: 0,
    passedStudents: 0
  };
  
  // Remove _id from statistics
  delete statistics._id;
  
  // 4. Return results with statistics
  res.json({
    success: true,
    results,
    statistics
  });
});

/**
 * @desc    Get result for a specific student
 * @route   GET /api/results/exam/:examId/student/:studentId
 * @access  Private (Student - own result, University/Admin - any result)
 * 
 * Requirements: 11.7, 11.8, 11.9, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8
 */
const getStudentResult = asyncHandler(async (req, res) => {
  const { examId, studentId } = req.params;
  
  // 1. Fetch result with exam and submission details using selective population
  const result = await Result.findOne({ exam: examId, student: studentId })
    .populate('exam', 'title totalMarks passingScore examType university') // Only needed exam fields
    .populate('student', 'name email') // Only name and email
    .populate({
      path: 'submission',
      select: 'answers submittedAt timeSpent answerSheetUrl', // Only needed submission fields
      populate: {
        path: 'answers.question',
        select: 'questionText questionType options marks order' // Only needed question fields
      }
    });
  
  if (!result) {
    res.status(404);
    throw new Error('Result not found');
  }
  
  // 2. Check authorization and publication status
  const userRole = req.user.role?.toLowerCase();
  const isStudent = userRole === 'student';
  const isOwnResult = req.user._id.toString() === studentId;
  
  // Students can only view their own results
  if (isStudent && !isOwnResult) {
    res.status(403);
    throw new Error('Not authorized to view this result');
  }
  
  // Students can only view published results
  if (isStudent && !result.isPublished) {
    res.status(403);
    throw new Error('Results have not been published yet');
  }
  
  // University users can only view results for their exams
  if (userRole === 'university' && result.exam.university.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to view results for this exam');
  }
  
  // 3. Mark result as viewed if student viewing for first time
  if (isStudent && isOwnResult && !result.viewedByStudent) {
    result.viewedByStudent = true;
    result.viewedAt = new Date();
    await result.save();

    // Log audit event for result viewed
    try {
      await auditLogService.logAuditEvent({
        userId: req.user._id,
        action: 'result_viewed',
        resource: 'result',
        resourceId: result._id,
        details: {
          examId: examId,
          examTitle: result.exam.title,
          obtainedMarks: result.obtainedMarks,
          percentage: result.percentage
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('Error logging audit event:', auditError);
    }
  }
  
  // 4. Return result with detailed breakdown
  res.json({
    success: true,
    result
  });
});

module.exports = {
  publishResults,
  getExamResults,
  getStudentResult
};
