const sendEmail = require('../utils/sendEmail');
const whatsAppService = require('./WhatsAppService');
const emailTemplates = require('../utils/emailTemplates');
const NotificationLog = require('../models/notificationLogModel');

/**
 * Notification Service (Production Grade)
 * Handles multi-channel delivery with persistent logging and error tracking.
 */
class NotificationService {
    /**
     * Send Multi-Channel Notification
     * @param {Object} user - User object { _id, name, email, phone }
     * @param {string} type - Notification type
     * @param {Object} data - Metadata for templates
     * @param {Object} options - { email: boolean, whatsapp: boolean }
     */
    async send(user, type, data = {}, options = { email: true, whatsapp: true }) {
        const _id = user._id || user.id;
        const name = user.name;
        const email = user.email;
        const phone = user.phone || user.profile?.phone;

        // Initialize Log Entry
        const log = await NotificationLog.create({
            userId: _id || null,
            recipientName: name,
            recipientEmail: email,
            recipientPhone: phone,
            type,
            channel: (options.email && options.whatsapp) ? 'both' : (options.email ? 'email' : 'whatsapp'),
            status: {
                email: { state: options.email && email ? 'pending' : 'skipped' },
                whatsapp: { state: options.whatsapp && phone ? 'pending' : 'skipped' }
            },
            metadata: data
        });

        console.log(`[NotificationService] Processing ID: ${log._id} for ${name}`);

        const tasks = [];

        // 1. Email Channel Implementation
        if (options.email && email) {
            tasks.push(this._executeEmail(log, user, type, data));
        }

        // 2. WhatsApp Channel Implementation
        if (options.whatsapp && phone) {
            tasks.push(this._executeWhatsApp(log, user, type, data));
        }

        // Execute in parallel for real-time performance
        await Promise.allSettled(tasks);

        // Refresh and return the final log status
        return await NotificationLog.findById(log._id);
    }

    async _executeEmail(log, user, type, data) {
        let subject = 'SkillDad Notification';
        let html = '';

        try {
            switch (type) {
                case 'welcome':
                    log.status.email = await this._execEmail(user, 'Integration Successful', emailTemplates.welcome(user.name, user.role || 'Student'));
                    break;
                case 'liveSession':
                    log.status.email = await this._execEmail(user, 'New Live Session Scheduled', emailTemplates.liveSessionScheduled(user.name, data.topic, data.startTime, data.description));
                    break;
                case 'liveSessionUpdate':
                    log.status.email = await this._execEmail(user, 'Session Recalibration', emailTemplates.sessionUpdate(user.name, data.topic, data.startTime, data.changes));
                    break;
                case 'exam':
                    log.status.email = await this._execEmail(user, `Exam Protocol: ${data.examTitle}`, emailTemplates.examScheduledStudent(user.name, data.examTitle, data.courseTitle, data.scheduledDate));
                    break;
                case 'examResult':
                    const resultSubject = data.passed ? `Victory! You passed ${data.examTitle}` : `Result: ${data.examTitle}`;
                    log.status.email = await this._execEmail(user, resultSubject, emailTemplates.examResultAnnounced(user.name, data.examTitle, data.score, data.percentage, data.passed));
                    break;
                default:
                    log.status.email = await this._execEmail(user, 'SkillDad Notification', `<p>Hello ${user.name}, you have a new notification from SkillDad.</p>`);
            }
        } catch (error) {
            log.status.email = {
                state: 'failed',
                error: error.message,
                timestamp: new Date()
            };
        }
        await log.save();
    }

    async _execEmail(user, subject, html) {
        try {
            const info = await sendEmail({ email: user.email, subject, html });
            return {
                state: 'sent',
                messageId: info.messageId,
                timestamp: new Date()
            };
        } catch (error) {
            return {
                state: 'failed',
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async _executeWhatsApp(log, user, type, data) {
        try {
            let result;
            switch (type) {
                case 'welcome':
                    result = await whatsAppService.sendTemplateMessage(user.phone, process.env.GUPSHUP_TEMPLATE_WELCOME || 'welcome_onboarding', [user.name]);
                    break;
                case 'liveSession':
                    result = await whatsAppService.notifyLiveSessionScheduled(user.name, user.phone, data.topic, data.startTime);
                    break;
                case 'liveSessionUpdate':
                    const updateMsg = `Session "${data.topic}" has been recalibrated.`;
                    result = await whatsAppService.sendTemplateMessage(user.phone, 'live_session_updated', [user.name, data.topic, updateMsg]);
                    break;
                case 'exam':
                    result = await whatsAppService.notifyExamScheduled(user.name, user.phone, data.examTitle, data.courseTitle, data.scheduledDate);
                    break;
                case 'examResult':
                    result = await whatsAppService.notifyExamResult(user.name, user.phone, data.examTitle, data.score, data.percentage, data.passed);
                    break;
                default:
                    result = null;
            }

            log.status.whatsapp = {
                state: result ? 'sent' : 'failed',
                messageId: result?.id || result?.messageId, // Depending on gateway provider
                timestamp: new Date()
            };
        } catch (error) {
            log.status.whatsapp = {
                state: 'failed',
                error: error.message,
                timestamp: new Date()
            };
        }
        await log.save();
    }
}

module.exports = new NotificationService();
