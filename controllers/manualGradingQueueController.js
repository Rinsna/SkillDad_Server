const asyncHandler = require('express-async-handler');
const Submission = require('../models/submissionModel');
const InteractiveContent = require('../models/interactiveContentModel');
const Course = require('../models/courseModel');
const Progress = require('../models/progressModel');
const ProgressTrackerService = require('../services/ProgressTrackerService');
const sendEmail = require('../utils/sendEmail');
const User = require('../models/userModel');

/**
 * @desc    Send grade notification email to student
 * @param   {Object} submission - The graded submission
 * @param   {Object} student - The student user object
 * @param   {Object} course - The course object
 * @access  Private helper function
 * 
 * Requirements: 18.1, 18.2, 18.3, 18.4
 */
const sendGradeNotification = async (submission, student, course) => {
    try {
        // Requirement 18.2: Include submission details and grade information
        const contentTitle = submission.content.title || 'Interactive Content';
        const contentType = submission.contentType.charAt(0).toUpperCase() + submission.contentType.slice(1);
        const scoreFormatted = submission.score.toFixed(1);
        const passingStatus = submission.contentType === 'quiz' 
            ? (submission.isPassing ? 'Passed ✓' : 'Not Passed')
            : '';

        // Build email HTML
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h2 style="color: #333; margin-top: 0;">Your Submission Has Been Graded</h2>
                    
                    <p style="color: #666; font-size: 16px;">Hello ${student.name},</p>
                    
                    <p style="color: #666; font-size: 16px;">
                        Your submission for <strong>${contentTitle}</strong> in the course 
                        <strong>${course.title}</strong> has been graded by your instructor.
                    </p>
                    
                    <div style="background-color: #f0f7ff; padding: 20px; border-radius: 6px; margin: 20px 0;">
                        <h3 style="color: #0066cc; margin-top: 0;">Submission Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666;"><strong>Content Type:</strong></td>
                                <td style="padding: 8px 0; color: #333;">${contentType}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666;"><strong>Score:</strong></td>
                                <td style="padding: 8px 0; color: #333; font-size: 18px; font-weight: bold;">${scoreFormatted}%</td>
                            </tr>
                            ${passingStatus ? `
                            <tr>
                                <td style="padding: 8px 0; color: #666;"><strong>Status:</strong></td>
                                <td style="padding: 8px 0; color: ${submission.isPassing ? '#28a745' : '#dc3545'}; font-weight: bold;">${passingStatus}</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td style="padding: 8px 0; color: #666;"><strong>Attempt Number:</strong></td>
                                <td style="padding: 8px 0; color: #333;">${submission.attemptNumber}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666;"><strong>Graded At:</strong></td>
                                <td style="padding: 8px 0; color: #333;">${new Date(submission.gradedAt).toLocaleString()}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <p style="color: #666; font-size: 16px;">
                        Log in to SkillDad to view detailed feedback and your answers.
                    </p>
                    
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/courses/${course._id}" 
                           style="display: inline-block; padding: 12px 30px; background-color: #0066cc; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            View Submission
                        </a>
                    </div>
                    
                    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;" />
                    
                    <p style="color: #999; font-size: 14px; text-align: center;">
                        This is an automated notification from SkillDad. Please do not reply to this email.
                    </p>
                </div>
            </div>
        `;

        // Requirement 18.3: Use existing sendEmail utility
        await sendEmail({
            email: student.email,
            subject: `Submission Graded - ${contentTitle}`,
            html: emailHtml
        });

        console.log(`Grade notification sent to ${student.email} for submission ${submission._id}`);
        return { success: true };
    } catch (error) {
        // Requirement 18.4: Log notification failures without blocking grading
        console.error('Failed to send grade notification:', error.message);
        console.error('Notification error details:', {
            submissionId: submission._id,
            studentEmail: student.email,
            error: error.message
        });
        // Don't throw - notification failure should not block grading
        return { success: false, error: error.message };
    }
};

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
        await ProgressTrackerService.recordCompletion(submission);
    }

    // Save the updated submission
    await submission.save();

    // Requirement 18.1: Send notification when manual grading is complete
    if (allGraded) {
        // Fetch student details for notification
        const student = await User.findById(submission.user);
        if (student && student.email) {
            // Send notification asynchronously (don't wait for it)
            sendGradeNotification(submission, student, course)
                .then(result => {
                    if (result.success) {
                        console.log(`Grade notification sent successfully for submission ${submission._id}`);
                    }
                })
                .catch(err => {
                    // Already logged in sendGradeNotification, just ensure it doesn't crash
                    console.error('Notification promise rejected:', err.message);
                });
        }
    }

    // Requirement 10.1, 10.2, 10.3, 10.4, 10.5: Include solutions in response if appropriate
    let responseAnswers = submission.answers;
    
    if (allGraded) {
        const shouldShowSolutions = 
            submission.content.showSolutionAfter === 'immediate' || 
            (submission.content.showSolutionAfter === 'submission' && submission.status === 'graded');

        if (shouldShowSolutions) {
            responseAnswers = submission.answers.map((answer, index) => {
                const question = submission.content.questions[index];
                return {
                    ...answer.toObject(),
                    correctAnswer: question.correctAnswer,
                    explanation: question.explanation
                };
            });
        }
    }

    res.status(200).json({
        success: true,
        message: allGraded ? 'Submission fully graded' : 'Answer graded successfully',
        submission: {
            _id: submission._id,
            score: submission.score,
            status: submission.status,
            isPassing: submission.isPassing,
            answers: responseAnswers
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

module.exports = {
    getPendingSubmissions,
    gradeSubmission,
    addFeedback,
    getSubmissionStats
};
