const asyncHandler = require('express-async-handler');
const Submission = require('../models/submissionModel');
const InteractiveContent = require('../models/interactiveContentModel');
const Course = require('../models/courseModel');
const Progress = require('../models/progressModel');

/**
 * @desc    Get pending submissions for manual grading filtered by course
 * @route   GET /api/grading/pending/:courseId
 * @access  Private (University/Instructor)
 * 
 * Requirements: 7.1, 7.2, 12.6
 */
const getPendingSubmissions = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const instructorId = req.user.id;

    // Verify course exists and instructor owns it
    const course = await Course.findById(courseId);
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Requirement 7.2, 12.6: Validate instructor owns the course
    if (course.instructor && course.instructor.toString() !== instructorId) {
        res.status(403);
        throw new Error('Not authorized to grade submissions for this course');
    }

    // Requirement 7.1, 7.2: Get submissions with status 'needs-review' or 'partially-graded'
    const pendingSubmissions = await Submission.find({
        course: courseId,
        status: { $in: ['needs-review'] }
    })
        .populate('user', 'name email')
        .populate('content', 'title type questions')
        .sort({ submittedAt: 1 }); // Oldest first

    res.status(200).json({
        success: true,
        count: pendingSubmissions.length,
        submissions: pendingSubmissions
    });
});

/**
 * @desc    Grade a specific answer in a submission
 * @route   POST /api/grading/grade/:submissionId
 * @access  Private (University/Instructor)
 * 
 * Requirements: 7.3, 7.4, 7.5, 7.6, 7.8, 8.6, 12.6
 */
const gradeSubmission = asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    const { questionId, pointsEarned, feedback } = req.body;
    const instructorId = req.user.id;

    // Validate required fields
    if (!questionId || pointsEarned === undefined || pointsEarned === null) {
        res.status(400);
        throw new Error('Missing required fields: questionId, pointsEarned');
    }

    // Fetch submission with populated content
    const submission = await Submission.findById(submissionId).populate('content');
    if (!submission) {
        res.status(404);
        throw new Error('Submission not found');
    }

    // Verify course exists and instructor owns it
    const course = await Course.findById(submission.course);
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Requirement 7.8, 12.6: Validate instructor owns the course
    if (course.instructor && course.instructor.toString() !== instructorId) {
        res.status(403);
        throw new Error('Not authorized to grade submissions for this course');
    }

    // Find the question in the content
    const question = submission.content.questions.find(
        q => q._id.toString() === questionId
    );

    if (!question) {
        res.status(404);
        throw new Error('Question not found in this content');
    }

    // Requirement 7.3: Validate points are within valid range [0, question.points]
    if (pointsEarned < 0 || pointsEarned > question.points) {
        res.status(400);
        throw new Error(`Points must be between 0 and ${question.points}`);
    }

    // Find the answer in the submission
    const answerIndex = submission.answers.findIndex(
        a => a.questionId.toString() === questionId
    );

    if (answerIndex === -1) {
        res.status(404);
        throw new Error('Answer not found in this submission');
    }

    // Requirement 7.4: Update answer with grade, feedback, and timestamp
    submission.answers[answerIndex].pointsEarned = pointsEarned;
    submission.answers[answerIndex].feedback = feedback || '';
    submission.answers[answerIndex].gradedAt = new Date();
    submission.answers[answerIndex].isCorrect = pointsEarned === question.points;

    // Requirement 7.5: Check if all questions are graded
    const allGraded = submission.answers.every(answer => answer.gradedAt !== null);

    if (allGraded) {
        // Requirement 7.6: Recalculate total score
        let totalPointsEarned = 0;
        let maxPoints = 0;

        for (let i = 0; i < submission.answers.length; i++) {
            const answer = submission.answers[i];
            const q = submission.content.questions[i];
            
            maxPoints += q.points;
            totalPointsEarned += answer.pointsEarned;
        }

        // Update submission score and status
        submission.score = maxPoints > 0 ? (totalPointsEarned / maxPoints) * 100 : 0;
        submission.status = 'graded';
        submission.gradedBy = instructorId;
        submission.gradedAt = new Date();

        // Requirement 8.6: Calculate quiz passing status based on passingScore
        if (submission.contentType === 'quiz' && submission.content.passingScore !== undefined) {
            submission.isPassing = submission.score >= submission.content.passingScore;
        }

        // Update progress record
        await updateProgressRecord(submission);
    }

    // Save the updated submission
    await submission.save();

    res.status(200).json({
        success: true,
        message: allGraded ? 'Submission fully graded' : 'Answer graded successfully',
        submission: {
            _id: submission._id,
            score: submission.score,
            status: submission.status,
            isPassing: submission.isPassing,
            answers: submission.answers
        }
    });
});

/**
 * @desc    Add feedback to an answer (without changing grade)
 * @route   POST /api/grading/feedback/:submissionId
 * @access  Private (University/Instructor)
 * 
 * Requirements: 7.4, 12.6
 */
const addFeedback = asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    const { questionId, feedback } = req.body;
    const instructorId = req.user.id;

    // Validate required fields
    if (!questionId || !feedback) {
        res.status(400);
        throw new Error('Missing required fields: questionId, feedback');
    }

    // Fetch submission
    const submission = await Submission.findById(submissionId);
    if (!submission) {
        res.status(404);
        throw new Error('Submission not found');
    }

    // Verify course exists and instructor owns it
    const course = await Course.findById(submission.course);
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Requirement 12.6: Validate instructor owns the course
    if (course.instructor && course.instructor.toString() !== instructorId) {
        res.status(403);
        throw new Error('Not authorized to add feedback for this course');
    }

    // Find the answer in the submission
    const answerIndex = submission.answers.findIndex(
        a => a.questionId.toString() === questionId
    );

    if (answerIndex === -1) {
        res.status(404);
        throw new Error('Answer not found in this submission');
    }

    // Requirement 7.4: Add instructor feedback
    submission.answers[answerIndex].feedback = feedback;

    // Save the updated submission
    await submission.save();

    res.status(200).json({
        success: true,
        message: 'Feedback added successfully',
        answer: submission.answers[answerIndex]
    });
});

/**
 * @desc    Get grading queue statistics for a course
 * @route   GET /api/grading/stats/:courseId
 * @access  Private (University/Instructor)
 * 
 * Requirements: 7.2, 12.6
 */
const getSubmissionStats = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const instructorId = req.user.id;

    // Verify course exists and instructor owns it
    const course = await Course.findById(courseId);
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Requirement 12.6: Validate instructor owns the course
    if (course.instructor && course.instructor.toString() !== instructorId) {
        res.status(403);
        throw new Error('Not authorized to view statistics for this course');
    }

    // Get statistics using aggregation
    const stats = await Submission.aggregate([
        {
            $match: { course: course._id }
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    // Format statistics
    const formattedStats = {
        total: 0,
        graded: 0,
        needsReview: 0,
        pending: 0
    };

    stats.forEach(stat => {
        formattedStats.total += stat.count;
        
        if (stat._id === 'graded') {
            formattedStats.graded = stat.count;
        } else if (stat._id === 'needs-review') {
            formattedStats.needsReview = stat.count;
        } else if (stat._id === 'pending') {
            formattedStats.pending = stat.count;
        }
    });

    // Get average grading time for completed submissions
    const gradedSubmissions = await Submission.find({
        course: courseId,
        status: 'graded',
        gradedAt: { $ne: null },
        submittedAt: { $ne: null }
    }).select('submittedAt gradedAt');

    let avgGradingTime = 0;
    if (gradedSubmissions.length > 0) {
        const totalTime = gradedSubmissions.reduce((sum, sub) => {
            const timeDiff = sub.gradedAt - sub.submittedAt;
            return sum + timeDiff;
        }, 0);
        avgGradingTime = Math.floor(totalTime / gradedSubmissions.length / 1000 / 60); // in minutes
    }

    res.status(200).json({
        success: true,
        stats: {
            ...formattedStats,
            averageGradingTimeMinutes: avgGradingTime
        }
    });
});

/**
 * Helper function to update progress record after grading
 * Requirements: 7.6, 9.1, 9.2, 9.3, 9.4
 */
const updateProgressRecord = async (submission) => {
    try {
        // Find or create progress record
        let progress = await Progress.findOne({
            user: submission.user,
            course: submission.course
        });

        if (!progress) {
            progress = await Progress.create({
                user: submission.user,
                course: submission.course,
                completedVideos: [],
                completedExercises: [],
                completedPractices: [],
                completedQuizzes: [],
                projectSubmissions: []
            });
        }

        const contentId = submission.content._id || submission.content;

        // Update progress based on content type
        if (submission.contentType === 'exercise') {
            // Requirement 9.2: Track exercises with attempts, best score, completion
            const existingIndex = progress.completedExercises.findIndex(
                ex => ex.content.toString() === contentId.toString()
            );

            if (existingIndex >= 0) {
                // Update existing exercise progress
                const existing = progress.completedExercises[existingIndex];
                existing.attempts += 1;
                existing.bestScore = Math.max(existing.bestScore, submission.score);
                existing.lastAttemptAt = submission.submittedAt;
                existing.isCompleted = submission.score >= 70; // 70% threshold for completion
            } else {
                // Add new exercise progress
                progress.completedExercises.push({
                    content: contentId,
                    attempts: submission.attemptNumber,
                    bestScore: submission.score,
                    lastAttemptAt: submission.submittedAt,
                    isCompleted: submission.score >= 70
                });
            }
        } else if (submission.contentType === 'practice') {
            // Requirement 9.3: Track practices - record completion when submitted
            if (!progress.completedPractices.includes(contentId)) {
                progress.completedPractices.push(contentId);
            }
        } else if (submission.contentType === 'quiz') {
            // Requirement 9.4: Track quizzes with attempts, best score, passing status
            const existingIndex = progress.completedQuizzes.findIndex(
                qz => qz.content.toString() === contentId.toString()
            );

            if (existingIndex >= 0) {
                // Update existing quiz progress
                const existing = progress.completedQuizzes[existingIndex];
                existing.attempts += 1;
                existing.bestScore = Math.max(existing.bestScore, submission.score);
                existing.isPassing = existing.isPassing || submission.isPassing;
                existing.lastAttemptAt = submission.submittedAt;
            } else {
                // Add new quiz progress
                progress.completedQuizzes.push({
                    content: contentId,
                    attempts: submission.attemptNumber,
                    bestScore: submission.score,
                    isPassing: submission.isPassing,
                    lastAttemptAt: submission.submittedAt
                });
            }
        }

        await progress.save();
    } catch (error) {
        console.error('Error updating progress record:', error);
        // Don't throw error - progress update failure shouldn't block grading
    }
};

module.exports = {
    getPendingSubmissions,
    gradeSubmission,
    addFeedback,
    getSubmissionStats
};
