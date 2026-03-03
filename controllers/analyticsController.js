const asyncHandler = require('express-async-handler');
const Submission = require('../models/submissionModel');
const InteractiveContent = require('../models/interactiveContentModel');
const Course = require('../models/courseModel');
const mongoose = require('mongoose');

/**
 * @desc    Get analytics for a course's interactive content
 * @route   GET /api/analytics/:courseId
 * @access  Private (University/Instructor)
 * 
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6
 */
const getCourseAnalytics = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const instructorId = req.user.id;
    
    // Query parameters for filtering
    const { startDate, endDate } = req.query;

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Requirement 19.6: Validate instructor owns the course
    if (course.instructor && course.instructor.toString() !== instructorId) {
        res.status(403);
        throw new Error('Not authorized to view analytics for this course');
    }

    // Build date filter for submissions
    const dateFilter = {};
    if (startDate || endDate) {
        dateFilter.submittedAt = {};
        if (startDate) {
            dateFilter.submittedAt.$gte = new Date(startDate);
        }
        if (endDate) {
            dateFilter.submittedAt.$lte = new Date(endDate);
        }
    }

    // Get all interactive content for this course
    const allContent = [];
    for (const module of course.modules) {
        if (module.interactiveContent && module.interactiveContent.length > 0) {
            const content = await InteractiveContent.find({
                _id: { $in: module.interactiveContent }
            });
            allContent.push(...content);
        }
    }

    // Requirement 19.1: Get submission statistics for the course
    const submissionStats = await Submission.aggregate([
        {
            $match: {
                course: mongoose.Types.ObjectId(courseId),
                ...dateFilter
            }
        },
        {
            $group: {
                _id: null,
                totalSubmissions: { $sum: 1 },
                averageScore: { $avg: '$score' },
                gradedSubmissions: {
                    $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] }
                },
                pendingSubmissions: {
                    $sum: { $cond: [{ $eq: ['$status', 'needs-review'] }, 1, 0] }
                },
                passingSubmissions: {
                    $sum: { $cond: ['$isPassing', 1, 0] }
                }
            }
        }
    ]);

    const stats = submissionStats[0] || {
        totalSubmissions: 0,
        averageScore: 0,
        gradedSubmissions: 0,
        pendingSubmissions: 0,
        passingSubmissions: 0
    };

    // Requirement 19.2: Calculate average scores per question
    const questionAnalytics = await calculateQuestionAnalytics(courseId, allContent, dateFilter);

    // Requirement 19.3: Calculate completion rates for each content item
    const contentCompletionRates = await calculateContentCompletionRates(courseId, allContent, dateFilter);

    // Requirement 19.4: Get grading queue statistics
    const gradingQueueStats = await Submission.aggregate([
        {
            $match: {
                course: mongoose.Types.ObjectId(courseId),
                status: 'needs-review'
            }
        },
        {
            $group: {
                _id: '$contentType',
                count: { $sum: 1 }
            }
        }
    ]);

    const queueStats = {
        total: 0,
        exercises: 0,
        practices: 0,
        quizzes: 0
    };

    gradingQueueStats.forEach(stat => {
        queueStats.total += stat.count;
        if (stat._id === 'exercise') queueStats.exercises = stat.count;
        if (stat._id === 'practice') queueStats.practices = stat.count;
        if (stat._id === 'quiz') queueStats.quizzes = stat.count;
    });

    // Calculate average grading time
    const gradedSubmissions = await Submission.find({
        course: courseId,
        status: 'graded',
        gradedAt: { $ne: null },
        submittedAt: { $ne: null },
        ...dateFilter
    }).select('submittedAt gradedAt');

    let avgGradingTime = 0;
    if (gradedSubmissions.length > 0) {
        const totalTime = gradedSubmissions.reduce((sum, sub) => {
            const timeDiff = sub.gradedAt - sub.submittedAt;
            return sum + timeDiff;
        }, 0);
        avgGradingTime = Math.floor(totalTime / gradedSubmissions.length / 1000 / 60); // in minutes
    }

    // Requirement 19.5: Return analytics filtered by course and time period
    res.status(200).json({
        success: true,
        courseId,
        courseName: course.title,
        dateRange: {
            startDate: startDate || null,
            endDate: endDate || null
        },
        submissionStatistics: {
            total: stats.totalSubmissions,
            graded: stats.gradedSubmissions,
            pending: stats.pendingSubmissions,
            averageScore: Math.round(stats.averageScore * 10) / 10,
            passingRate: stats.totalSubmissions > 0 
                ? Math.round((stats.passingSubmissions / stats.totalSubmissions) * 100 * 10) / 10
                : 0
        },
        questionAnalytics,
        contentCompletionRates,
        gradingQueue: {
            ...queueStats,
            averageGradingTimeMinutes: avgGradingTime
        }
    });
});

/**
 * Helper function to calculate average scores per question
 * Requirement 19.2
 */
const calculateQuestionAnalytics = async (courseId, allContent, dateFilter) => {
    const questionStats = [];

    for (const content of allContent) {
        // Get all submissions for this content
        const submissions = await Submission.find({
            course: courseId,
            content: content._id,
            status: 'graded',
            ...dateFilter
        });

        if (submissions.length === 0) continue;

        // Calculate stats for each question
        const questionData = content.questions.map((question, index) => {
            const scores = [];
            const correctCount = submissions.reduce((count, submission) => {
                const answer = submission.answers[index];
                if (answer && answer.gradedAt) {
                    scores.push(answer.pointsEarned);
                    return count + (answer.isCorrect ? 1 : 0);
                }
                return count;
            }, 0);

            const avgScore = scores.length > 0
                ? scores.reduce((sum, score) => sum + score, 0) / scores.length
                : 0;

            const avgPercentage = question.points > 0
                ? (avgScore / question.points) * 100
                : 0;

            return {
                questionId: question._id,
                questionText: question.questionText.substring(0, 100) + (question.questionText.length > 100 ? '...' : ''),
                questionType: question.questionType,
                maxPoints: question.points,
                averageScore: Math.round(avgScore * 10) / 10,
                averagePercentage: Math.round(avgPercentage * 10) / 10,
                correctCount,
                totalAttempts: scores.length,
                correctRate: scores.length > 0
                    ? Math.round((correctCount / scores.length) * 100 * 10) / 10
                    : 0
            };
        });

        questionStats.push({
            contentId: content._id,
            contentTitle: content.title,
            contentType: content.type,
            questions: questionData
        });
    }

    return questionStats;
};

/**
 * Helper function to calculate completion rates for each content item
 * Requirement 19.3
 */
const calculateContentCompletionRates = async (courseId, allContent, dateFilter) => {
    const completionRates = [];

    // Get total enrolled students
    const Enrollment = require('../models/enrollmentModel');
    const totalStudents = await Enrollment.countDocuments({
        course: courseId,
        status: 'active'
    });

    for (const content of allContent) {
        // Count unique students who submitted
        const submissions = await Submission.find({
            course: courseId,
            content: content._id,
            ...dateFilter
        }).distinct('user');

        const submissionCount = submissions.length;
        const completionRate = totalStudents > 0
            ? (submissionCount / totalStudents) * 100
            : 0;

        // Get average score for this content
        const avgScoreResult = await Submission.aggregate([
            {
                $match: {
                    course: mongoose.Types.ObjectId(courseId),
                    content: content._id,
                    status: 'graded',
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    averageScore: { $avg: '$score' },
                    totalSubmissions: { $sum: 1 }
                }
            }
        ]);

        const avgScore = avgScoreResult[0]?.averageScore || 0;
        const totalSubmissions = avgScoreResult[0]?.totalSubmissions || 0;

        completionRates.push({
            contentId: content._id,
            contentTitle: content.title,
            contentType: content.type,
            attemptsAllowed: content.attemptsAllowed,
            totalStudents,
            studentsAttempted: submissionCount,
            completionRate: Math.round(completionRate * 10) / 10,
            totalSubmissions,
            averageScore: Math.round(avgScore * 10) / 10,
            averageAttempts: submissionCount > 0
                ? Math.round((totalSubmissions / submissionCount) * 10) / 10
                : 0
        });
    }

    return completionRates;
};

/**
 * @desc    Get detailed analytics for a specific content item
 * @route   GET /api/analytics/:courseId/content/:contentId
 * @access  Private (University/Instructor)
 * 
 * Requirements: 19.1, 19.2, 19.3, 19.6
 */
const getContentAnalytics = asyncHandler(async (req, res) => {
    const { courseId, contentId } = req.params;
    const instructorId = req.user.id;
    const { startDate, endDate } = req.query;

    // Verify course exists and instructor owns it
    const course = await Course.findById(courseId);
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Requirement 19.6: Validate instructor owns the course
    if (course.instructor && course.instructor.toString() !== instructorId) {
        res.status(403);
        throw new Error('Not authorized to view analytics for this course');
    }

    // Verify content exists
    const content = await InteractiveContent.findById(contentId);
    if (!content) {
        res.status(404);
        throw new Error('Interactive content not found');
    }

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
        dateFilter.submittedAt = {};
        if (startDate) dateFilter.submittedAt.$gte = new Date(startDate);
        if (endDate) dateFilter.submittedAt.$lte = new Date(endDate);
    }

    // Get all submissions for this content
    const submissions = await Submission.find({
        course: courseId,
        content: contentId,
        ...dateFilter
    }).populate('user', 'name email');

    // Calculate overall statistics
    const totalSubmissions = submissions.length;
    const gradedSubmissions = submissions.filter(s => s.status === 'graded');
    const avgScore = gradedSubmissions.length > 0
        ? gradedSubmissions.reduce((sum, s) => sum + s.score, 0) / gradedSubmissions.length
        : 0;

    // Calculate question-level statistics
    const questionStats = content.questions.map((question, index) => {
        const scores = [];
        const correctCount = gradedSubmissions.reduce((count, submission) => {
            const answer = submission.answers[index];
            if (answer && answer.gradedAt) {
                scores.push(answer.pointsEarned);
                return count + (answer.isCorrect ? 1 : 0);
            }
            return count;
        }, 0);

        const avgScore = scores.length > 0
            ? scores.reduce((sum, score) => sum + score, 0) / scores.length
            : 0;

        return {
            questionNumber: index + 1,
            questionId: question._id,
            questionText: question.questionText,
            questionType: question.questionType,
            maxPoints: question.points,
            averageScore: Math.round(avgScore * 10) / 10,
            averagePercentage: question.points > 0
                ? Math.round((avgScore / question.points) * 100 * 10) / 10
                : 0,
            correctCount,
            totalAttempts: scores.length,
            correctRate: scores.length > 0
                ? Math.round((correctCount / scores.length) * 100 * 10) / 10
                : 0
        };
    });

    // Get student-level data
    const studentData = submissions.reduce((acc, submission) => {
        const userId = submission.user._id.toString();
        if (!acc[userId]) {
            acc[userId] = {
                studentId: submission.user._id,
                studentName: submission.user.name,
                studentEmail: submission.user.email,
                attempts: [],
                bestScore: 0,
                latestScore: 0
            };
        }

        acc[userId].attempts.push({
            attemptNumber: submission.attemptNumber,
            score: submission.score,
            status: submission.status,
            submittedAt: submission.submittedAt,
            gradedAt: submission.gradedAt
        });

        acc[userId].bestScore = Math.max(acc[userId].bestScore, submission.score);
        acc[userId].latestScore = submission.score;

        return acc;
    }, {});

    res.status(200).json({
        success: true,
        content: {
            id: content._id,
            title: content.title,
            type: content.type,
            attemptsAllowed: content.attemptsAllowed,
            passingScore: content.passingScore
        },
        dateRange: {
            startDate: startDate || null,
            endDate: endDate || null
        },
        overallStatistics: {
            totalSubmissions,
            gradedSubmissions: gradedSubmissions.length,
            pendingSubmissions: totalSubmissions - gradedSubmissions.length,
            averageScore: Math.round(avgScore * 10) / 10,
            uniqueStudents: Object.keys(studentData).length
        },
        questionStatistics: questionStats,
        studentPerformance: Object.values(studentData)
    });
});

module.exports = {
    getCourseAnalytics,
    getContentAnalytics
};
