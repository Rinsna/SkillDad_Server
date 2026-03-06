const cron = require('node-cron');
const Exam = require('../models/examModel');
const ExamNotificationService = require('../services/ExamNotificationService');

/**
 * Exam Reminder Job
 * Sends reminder notifications to students 30 minutes before exam starts
 * Runs every 5 minutes to check for upcoming exams
 */

let reminderJob = null;
const sentReminders = new Set(); // Track sent reminders to avoid duplicates

/**
 * Check for exams starting in 30 minutes and send reminders
 */
async function checkAndSendReminders() {
    try {
        const now = new Date();
        const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
        const twentyFiveMinutesFromNow = new Date(now.getTime() + 25 * 60 * 1000);

        // Find exams starting between 25-30 minutes from now
        // This 5-minute window ensures we catch exams even if the job runs slightly off schedule
        const upcomingExams = await Exam.find({
            scheduledStartTime: {
                $gte: twentyFiveMinutesFromNow,
                $lte: thirtyMinutesFromNow
            },
            status: 'scheduled'
        }).populate('course', 'title');

        if (upcomingExams.length === 0) {
            console.log('[ExamReminderJob] No exams starting in 30 minutes');
            return;
        }

        console.log(`[ExamReminderJob] Found ${upcomingExams.length} exam(s) starting in ~30 minutes`);

        // Send reminders for each exam
        for (const exam of upcomingExams) {
            const reminderKey = `${exam._id}-${exam.scheduledStartTime.getTime()}`;
            
            // Skip if reminder already sent for this exam
            if (sentReminders.has(reminderKey)) {
                console.log(`[ExamReminderJob] Reminder already sent for exam: ${exam.title}`);
                continue;
            }

            try {
                console.log(`[ExamReminderJob] Sending reminder for exam: ${exam.title}`);
                
                const result = await ExamNotificationService.notifyExamReminder(exam);
                
                // Mark reminder as sent
                sentReminders.add(reminderKey);
                
                console.log(`[ExamReminderJob] Reminder sent successfully: ${result.sent}/${result.total} students notified`);
            } catch (error) {
                console.error(`[ExamReminderJob] Failed to send reminder for exam ${exam.title}:`, error.message);
            }
        }

        // Clean up old reminder keys (older than 2 hours)
        const twoHoursAgo = now.getTime() - 2 * 60 * 60 * 1000;
        for (const key of sentReminders) {
            const timestamp = parseInt(key.split('-').pop());
            if (timestamp < twoHoursAgo) {
                sentReminders.delete(key);
            }
        }
    } catch (error) {
        console.error('[ExamReminderJob] Error in checkAndSendReminders:', error);
    }
}

/**
 * Start the exam reminder cron job
 * Runs every 5 minutes
 */
function startExamReminderJob() {
    if (reminderJob) {
        console.log('[ExamReminderJob] Job already running');
        return;
    }

    // Run every 5 minutes: */5 * * * *
    reminderJob = cron.schedule('*/5 * * * *', async () => {
        console.log('[ExamReminderJob] Running scheduled check...');
        await checkAndSendReminders();
    });

    console.log('[ExamReminderJob] Exam reminder job started (runs every 5 minutes)');

    // Run immediately on startup
    checkAndSendReminders();
}

/**
 * Stop the exam reminder cron job
 */
function stopExamReminderJob() {
    if (reminderJob) {
        reminderJob.stop();
        reminderJob = null;
        console.log('[ExamReminderJob] Exam reminder job stopped');
    }
}

/**
 * Get job status
 */
function getJobStatus() {
    return {
        running: !!reminderJob,
        remindersSent: sentReminders.size
    };
}

module.exports = {
    startExamReminderJob,
    stopExamReminderJob,
    checkAndSendReminders,
    getJobStatus
};
