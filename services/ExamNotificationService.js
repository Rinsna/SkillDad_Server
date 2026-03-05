const notificationService = require('./NotificationService');
const emailTemplates = require('../utils/emailTemplates');
const Enrollment = require('../models/enrollmentModel');
const User = require('../models/userModel');
const Course = require('../models/courseModel');

/**
 * Exam Notification Service
 * Handles all exam-related notifications (email + in-app)
 * Integrates with existing NotificationService for multi-channel delivery
 */
class ExamNotificationService {
    /**
     * Notify students when an exam is scheduled
     * @param {Object} exam - Exam document with populated course
     * @param {Array} students - Array of student user objects (optional, will fetch if not provided)
     */
    async notifyExamScheduled(exam, students = null) {
        try {
            // Fetch students if not provided
            if (!students) {
                const enrollments = await Enrollment.find({
                    course: exam.course._id || exam.course,
                    status: 'active'
                }).populate('student', '_id name email profile phone');

                students = enrollments
                    .map(e => e.student)
                    .filter(s => !!s);
            }

            // Get course details
            const course = exam.course.title 
                ? exam.course 
                : await Course.findById(exam.course).select('title');

            console.log(`[ExamNotificationService] Notifying ${students.length} students about exam: ${exam.title}`);

            // Send notifications to all students
            const notificationPromises = students.map(student => 
                notificationService.send(
                    {
                        _id: student._id,
                        name: student.name,
                        email: student.email,
                        phone: student.profile?.phone || student.phone
                    },
                    'exam',
                    {
                        examTitle: exam.title,
                        courseTitle: course.title,
                        scheduledDate: exam.scheduledStartTime
                    },
                    { email: true, whatsapp: true }
                ).catch(err => {
                    console.error(`[ExamNotificationService] Failed to notify ${student.email}:`, err.message);
                    return null;
                })
            );

            const results = await Promise.allSettled(notificationPromises);
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

            console.log(`[ExamNotificationService] Exam scheduled notifications: ${successCount}/${students.length} sent`);

            return {
                success: true,
                sent: successCount,
                total: students.length
            };
        } catch (error) {
            console.error('[ExamNotificationService] Error in notifyExamScheduled:', error.message);
            throw error;
        }
    }

    /**
     * Send exam reminder notification (30 minutes before exam)
     * @param {Object} exam - Exam document with populated course
     * @param {Array} students - Array of student user objects (optional, will fetch if not provided)
     */
    async notifyExamReminder(exam, students = null) {
        try {
            // Fetch students if not provided
            if (!students) {
                const enrollments = await Enrollment.find({
                    course: exam.course._id || exam.course,
                    status: 'active'
                }).populate('student', '_id name email profile phone');

                students = enrollments
                    .map(e => e.student)
                    .filter(s => !!s);
            }

            // Get course details
            const course = exam.course.title 
                ? exam.course 
                : await Course.findById(exam.course).select('title');

            console.log(`[ExamNotificationService] Sending exam reminder to ${students.length} students for: ${exam.title}`);

            // Send reminder notifications
            const notificationPromises = students.map(student => 
                this._sendExamReminder(student, exam, course)
                    .catch(err => {
                        console.error(`[ExamNotificationService] Failed to send reminder to ${student.email}:`, err.message);
                        return null;
                    })
            );

            const results = await Promise.allSettled(notificationPromises);
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

            console.log(`[ExamNotificationService] Exam reminder notifications: ${successCount}/${students.length} sent`);

            return {
                success: true,
                sent: successCount,
                total: students.length
            };
        } catch (error) {
            console.error('[ExamNotificationService] Error in notifyExamReminder:', error.message);
            throw error;
        }
    }

    /**
     * Internal method to send exam reminder
     */
    async _sendExamReminder(student, exam, course) {
        // For now, use the existing notification service with exam type
        // In the future, we can add a specific 'examReminder' type to NotificationService
        return notificationService.send(
            {
                _id: student._id,
                name: student.name,
                email: student.email,
                phone: student.profile?.phone || student.phone
            },
            'examReminder',
            {
                examTitle: exam.title,
                courseTitle: course.title,
                startTime: exam.scheduledStartTime,
                duration: exam.duration
            },
            { email: true, whatsapp: false } // Email only for reminders
        );
    }

    /**
     * Notify student when results are published
     * @param {Object} exam - Exam document
     * @param {Object} student - Student user object
     * @param {Object} result - Result document with scores
     */
    async notifyResultPublished(exam, student, result) {
        try {
            console.log(`[ExamNotificationService] Notifying ${student.email} about published result for: ${exam.title}`);

            await notificationService.send(
                {
                    _id: student._id,
                    name: student.name,
                    email: student.email,
                    phone: student.profile?.phone || student.phone
                },
                'examResult',
                {
                    examTitle: exam.title,
                    score: `${result.obtainedMarks}/${result.totalMarks}`,
                    percentage: result.percentage,
                    passed: result.isPassed
                },
                { email: true, whatsapp: true }
            );

            return { success: true };
        } catch (error) {
            console.error('[ExamNotificationService] Error in notifyResultPublished:', error.message);
            throw error;
        }
    }

    /**
     * Notify student when exam is cancelled
     * @param {Object} exam - Exam document with populated course
     * @param {Array} students - Array of student user objects (optional, will fetch if not provided)
     * @param {String} reason - Cancellation reason
     */
    async notifyExamCancelled(exam, students = null, reason = '') {
        try {
            // Fetch students if not provided
            if (!students) {
                const enrollments = await Enrollment.find({
                    course: exam.course._id || exam.course,
                    status: 'active'
                }).populate('student', '_id name email profile phone');

                students = enrollments
                    .map(e => e.student)
                    .filter(s => !!s);
            }

            // Get course details
            const course = exam.course.title 
                ? exam.course 
                : await Course.findById(exam.course).select('title');

            console.log(`[ExamNotificationService] Notifying ${students.length} students about exam cancellation: ${exam.title}`);

            // Send cancellation notifications
            const notificationPromises = students.map(student => 
                this._sendExamCancellation(student, exam, course, reason)
                    .catch(err => {
                        console.error(`[ExamNotificationService] Failed to notify ${student.email}:`, err.message);
                        return null;
                    })
            );

            const results = await Promise.allSettled(notificationPromises);
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

            console.log(`[ExamNotificationService] Exam cancellation notifications: ${successCount}/${students.length} sent`);

            return {
                success: true,
                sent: successCount,
                total: students.length
            };
        } catch (error) {
            console.error('[ExamNotificationService] Error in notifyExamCancelled:', error.message);
            throw error;
        }
    }

    /**
     * Internal method to send exam cancellation notification
     */
    async _sendExamCancellation(student, exam, course, reason) {
        // For now, use a custom implementation since 'examCancelled' type doesn't exist yet
        // We'll need to add this to the main NotificationService
        return notificationService.send(
            {
                _id: student._id,
                name: student.name,
                email: student.email,
                phone: student.profile?.phone || student.phone
            },
            'examCancelled',
            {
                examTitle: exam.title,
                courseTitle: course.title,
                reason: reason
            },
            { email: true, whatsapp: false }
        );
    }

    /**
     * Notify student when submission is received
     * @param {Object} submission - Submission document
     * @param {Object} student - Student user object
     * @param {Object} exam - Exam document
     */
    async notifySubmissionReceived(submission, student, exam) {
        try {
            console.log(`[ExamNotificationService] Sending submission confirmation to ${student.email} for: ${exam.title}`);

            await this._sendSubmissionConfirmation(student, exam, submission);

            return { success: true };
        } catch (error) {
            console.error('[ExamNotificationService] Error in notifySubmissionReceived:', error.message);
            throw error;
        }
    }

    /**
     * Internal method to send submission confirmation
     */
    async _sendSubmissionConfirmation(student, exam, submission) {
        // For now, use a custom implementation since 'submissionConfirmation' type doesn't exist yet
        return notificationService.send(
            {
                _id: student._id,
                name: student.name,
                email: student.email,
                phone: student.profile?.phone || student.phone
            },
            'submissionConfirmation',
            {
                examTitle: exam.title,
                submittedAt: submission.submittedAt,
                isAutoSubmitted: submission.isAutoSubmitted
            },
            { email: true, whatsapp: false }
        );
    }

    /**
     * Bulk notify multiple students efficiently
     * @param {Array} userIds - Array of user IDs
     * @param {String} type - Notification type
     * @param {Object} data - Notification data
     */
    async sendBulkNotification(userIds, type, data) {
        try {
            const users = await User.find({
                _id: { $in: userIds }
            }).select('_id name email profile phone');

            console.log(`[ExamNotificationService] Sending bulk notification (${type}) to ${users.length} users`);

            const notificationPromises = users.map(user => 
                notificationService.send(
                    {
                        _id: user._id,
                        name: user.name,
                        email: user.email,
                        phone: user.profile?.phone || user.phone
                    },
                    type,
                    data,
                    { email: true, whatsapp: true }
                ).catch(err => {
                    console.error(`[ExamNotificationService] Failed to notify ${user.email}:`, err.message);
                    return null;
                })
            );

            const results = await Promise.allSettled(notificationPromises);
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
            const failedCount = users.length - successCount;

            console.log(`[ExamNotificationService] Bulk notification complete: ${successCount} sent, ${failedCount} failed`);

            return {
                success: true,
                sent: successCount,
                failed: failedCount,
                total: users.length
            };
        } catch (error) {
            console.error('[ExamNotificationService] Error in sendBulkNotification:', error.message);
            throw error;
        }
    }
}

module.exports = new ExamNotificationService();
