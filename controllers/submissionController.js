const asyncHandler = require('express-async-handler');
const Submission = require('../models/submissionModel');
const InteractiveContent = require('../models/interactiveContentModel');
const Course = require('../models/courseModel');
const Enrollment = require('../models/enrollmentModel');
const AutoGraderService = require('../services/AutoGraderService');

/**
 * @desc    Submit answers to interactive content
 * @route   POST /api/submissions
 * @access  Private (Student)
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 12.4, 12.5
 */
const submitAnswer = asyncHandler(async (req, res) => {
    const { contentId, answers, startedAt } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!contentId || !answers || !startedAt) {
        res.status(400);
        throw new Error('Missing required fields: contentId, answers, startedAt');
    }

    // Fetch interactive content
    const content = await InteractiveContent.findById(contentId);
    if (!content) {
        res.status(404);
        throw new Error('Interactive content not found');
    }

    // Find the course and module containing this content
    const course = await Course.findOne({
        'modules.interactiveContent': contentId
    });

    if (!course) {
        res.status(404);
        throw new Error('Course not found for this content');
    }

    // Find the module
    const module = course.modules.find(m => 
        m.interactiveContent.some(ic => ic.toString() === contentId)
    );

    // Requirement 5.2: Verify enrollment
    const enrollment = await Enrollment.findOne({
        student: userId,
        course: course._id,
        status: 'active'
    });

    if (!enrollment) {
        res.status(403);
        throw new Error('You must be enrolled in this course to submit answers');
    }

    // Requirement 5.1: Validate answer count matches question count
    if (answers.length !== content.questions.length) {
        res.status(400);
        throw new Error(`Answer count (${answers.length}) must match question count (${content.questions.length})`);
    }

    // Requirement 5.3: Check attempt limits
    const attemptCount = await Submission.countDocuments({
        user: userId,
        content: contentId
    });

    if (content.attemptsAllowed !== -1 && attemptCount >= content.attemptsAllowed) {
        res.status(403);
        throw new Error('Maximum attempts exceeded for this content');
    }

    // Requirement 5.4: Validate time limit
    const startTime = new Date(startedAt);
    const currentTime = new Date();
    const timeSpentSeconds = Math.floor((currentTime - startTime) / 1000);

    if (content.timeLimit && timeSpentSeconds > content.timeLimit * 60) {
        res.status(400);
        throw new Error('Time limit exceeded. Submission not accepted.');
    }

    // Grade answers and prepare submission data
    const gradedAnswers = [];
    let totalPointsEarned = 0;
    let maxPoints = 0;
    let hasSubjective = false;

    for (let i = 0; i < content.questions.length; i++) {
        const question = content.questions[i];
        const answer = answers[i];

        maxPoints += question.points;

        // Validate questionId matches
        if (answer.questionId !== question._id.toString()) {
            res.status(400);
            throw new Error(`Answer questionId mismatch at index ${i}`);
        }

        const gradedAnswer = {
            questionId: question._id,
            answerValue: answer.answerValue
        };

        // Check if question is objective or subjective
        if (AutoGraderService.isObjectiveQuestion(question.questionType)) {
            // Requirement 5.7, 6.1: Auto-grade objective questions
            const gradeResult = AutoGraderService.gradeQuestion(question, answer.answerValue);
            
            gradedAnswer.isCorrect = gradeResult.isCorrect;
            gradedAnswer.pointsEarned = gradeResult.pointsEarned;
            gradedAnswer.feedback = gradeResult.feedback;
            gradedAnswer.gradedAt = currentTime;
            
            totalPointsEarned += gradeResult.pointsEarned;
        } else {
            // Subjective question - queue for manual review
            gradedAnswer.isCorrect = null;
            gradedAnswer.pointsEarned = 0;
            gradedAnswer.feedback = 'Pending instructor review';
            gradedAnswer.gradedAt = null;
            hasSubjective = true;
        }

        gradedAnswers.push(gradedAnswer);
    }

    // Calculate score percentage
    const scorePercentage = maxPoints > 0 ? (totalPointsEarned / maxPoints) * 100 : 0;

    // Determine submission status
    const status = hasSubjective ? 'needs-review' : 'graded';

    // Check if passing (for quizzes)
    let isPassing = false;
    if (content.type === 'quiz' && content.passingScore !== undefined && content.passingScore !== null) {
        isPassing = scorePercentage >= content.passingScore;
    }

    // Requirement 5.5, 5.6: Create submission with timestamps and attempt tracking
    const submission = await Submission.create({
        user: userId,
        course: course._id,
        module: module._id,
        content: contentId,
        contentType: content.type,
        answers: gradedAnswers,
        score: scorePercentage,
        maxScore: maxPoints,
        isPassing,
        status,
        attemptNumber: attemptCount + 1,
        startedAt: startTime,
        submittedAt: currentTime,
        timeSpent: timeSpentSeconds
    });

    // Requirement 5.7: Return submission result
    res.status(201).json({
        success: true,
        submissionId: submission._id,
        score: scorePercentage,
        isPassing,
        status,
        answers: gradedAnswers,
        attemptNumber: submission.attemptNumber,
        timeSpent: timeSpentSeconds
    });
});

/**
 * @desc    Get a single submission by ID
 * @route   GET /api/submissions/:submissionId
 * @access  Private (Student - own submissions, University - their course submissions)
 * 
 * Requirements: 12.4, 12.5
 */
const getSubmission = asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Fetch submission with populated references
    const submission = await Submission.findById(submissionId)
        .populate('user', 'name email')
        .populate('course', 'title instructor')
        .populate('content');

    if (!submission) {
        res.status(404);
        throw new Error('Submission not found');
    }

    // Requirement 12.4, 12.5: Authorization checks
    // Students can only view their own submissions
    if (userRole === 'student' && submission.user._id.toString() !== userId) {
        res.status(403);
        throw new Error('Not authorized to view this submission');
    }

    // Universities can only view submissions for their courses
    if (userRole === 'university') {
        const course = await Course.findById(submission.course._id);
        if (!course || (course.instructor && course.instructor.toString() !== userId)) {
            res.status(403);
            throw new Error('Not authorized to view this submission');
        }
    }

    res.status(200).json({
        success: true,
        submission
    });
});

/**
 * @desc    Get all submissions for a user in a course
 * @route   GET /api/submissions/course/:courseId
 * @access  Private (Student - own submissions, University - their course submissions)
 * 
 * Requirements: 12.4, 12.5
 */
const getUserSubmissions = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    let query = { course: courseId };

    // Requirement 12.4, 12.5: Authorization checks
    if (userRole === 'student') {
        // Students can only view their own submissions
        query.user = userId;

        // Verify enrollment
        const enrollment = await Enrollment.findOne({
            student: userId,
            course: courseId
        });

        if (!enrollment) {
            res.status(403);
            throw new Error('You must be enrolled in this course');
        }
    } else if (userRole === 'university') {
        // Universities can only view submissions for their courses
        if (course.instructor && course.instructor.toString() !== userId) {
            res.status(403);
            throw new Error('Not authorized to view submissions for this course');
        }
    }

    // Fetch submissions
    const submissions = await Submission.find(query)
        .populate('user', 'name email')
        .populate('content', 'title type')
        .sort({ submittedAt: -1 });

    res.status(200).json({
        success: true,
        count: submissions.length,
        submissions
    });
});

/**
 * @desc    Retry a submission (create new attempt)
 * @route   POST /api/submissions/:submissionId/retry
 * @access  Private (Student)
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */
const retrySubmission = asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    const { answers, startedAt } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!answers || !startedAt) {
        res.status(400);
        throw new Error('Missing required fields: answers, startedAt');
    }

    // Fetch original submission
    const originalSubmission = await Submission.findById(submissionId);
    if (!originalSubmission) {
        res.status(404);
        throw new Error('Original submission not found');
    }

    // Verify user owns the submission
    if (originalSubmission.user.toString() !== userId) {
        res.status(403);
        throw new Error('Not authorized to retry this submission');
    }

    // Fetch interactive content
    const content = await InteractiveContent.findById(originalSubmission.content);
    if (!content) {
        res.status(404);
        throw new Error('Interactive content not found');
    }

    // Requirement 11.2: Check remaining attempts
    const attemptCount = await Submission.countDocuments({
        user: userId,
        content: content._id
    });

    if (content.attemptsAllowed !== -1 && attemptCount >= content.attemptsAllowed) {
        res.status(403);
        throw new Error('Maximum attempts exceeded for this content');
    }

    // Requirement 11.4: Reset timer for timed content
    const startTime = new Date(startedAt);
    const currentTime = new Date();
    const timeSpentSeconds = Math.floor((currentTime - startTime) / 1000);

    if (content.timeLimit && timeSpentSeconds > content.timeLimit * 60) {
        res.status(400);
        throw new Error('Time limit exceeded. Submission not accepted.');
    }

    // Validate answer count
    if (answers.length !== content.questions.length) {
        res.status(400);
        throw new Error(`Answer count (${answers.length}) must match question count (${content.questions.length})`);
    }

    // Grade answers (same logic as submitAnswer)
    const gradedAnswers = [];
    let totalPointsEarned = 0;
    let maxPoints = 0;
    let hasSubjective = false;

    for (let i = 0; i < content.questions.length; i++) {
        const question = content.questions[i];
        const answer = answers[i];

        maxPoints += question.points;

        const gradedAnswer = {
            questionId: question._id,
            answerValue: answer.answerValue
        };

        if (AutoGraderService.isObjectiveQuestion(question.questionType)) {
            const gradeResult = AutoGraderService.gradeQuestion(question, answer.answerValue);
            
            gradedAnswer.isCorrect = gradeResult.isCorrect;
            gradedAnswer.pointsEarned = gradeResult.pointsEarned;
            gradedAnswer.feedback = gradeResult.feedback;
            gradedAnswer.gradedAt = currentTime;
            
            totalPointsEarned += gradeResult.pointsEarned;
        } else {
            gradedAnswer.isCorrect = null;
            gradedAnswer.pointsEarned = 0;
            gradedAnswer.feedback = 'Pending instructor review';
            gradedAnswer.gradedAt = null;
            hasSubjective = true;
        }

        gradedAnswers.push(gradedAnswer);
    }

    // Calculate score
    const scorePercentage = maxPoints > 0 ? (totalPointsEarned / maxPoints) * 100 : 0;
    const status = hasSubjective ? 'needs-review' : 'graded';

    let isPassing = false;
    if (content.type === 'quiz' && content.passingScore !== undefined && content.passingScore !== null) {
        isPassing = scorePercentage >= content.passingScore;
    }

    // Requirement 11.3: Create new submission with incremented attempt number
    const newSubmission = await Submission.create({
        user: userId,
        course: originalSubmission.course,
        module: originalSubmission.module,
        content: content._id,
        contentType: content.type,
        answers: gradedAnswers,
        score: scorePercentage,
        maxScore: maxPoints,
        isPassing,
        status,
        attemptNumber: attemptCount + 1,
        startedAt: startTime,
        submittedAt: currentTime,
        timeSpent: timeSpentSeconds
    });

    res.status(201).json({
        success: true,
        submissionId: newSubmission._id,
        score: scorePercentage,
        isPassing,
        status,
        answers: gradedAnswers,
        attemptNumber: newSubmission.attemptNumber,
        timeSpent: timeSpentSeconds
    });
});

module.exports = {
    submitAnswer,
    getSubmission,
    getUserSubmissions,
    retrySubmission
};
