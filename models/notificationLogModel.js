const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Optional for demo or guest alerts
    },
    recipientName: String,
    recipientEmail: String,
    recipientPhone: String,
    type: {
        type: String,
        required: true,
        enum: ['welcome', 'liveSession', 'liveSessionUpdate', 'exam', 'examResult', 'enrollment', 'support', 'reminder', 'custom']
    },
    channel: {
        type: String,
        required: true,
        enum: ['email', 'whatsapp', 'both']
    },
    status: {
        email: {
            state: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'skipped' },
            messageId: String,
            error: String,
            timestamp: Date
        },
        whatsapp: {
            state: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'skipped' },
            messageId: String,
            statusInGateway: String, // e.g., 'delivered', 'read' (if supported via webhook)
            error: String,
            timestamp: Date
        }
    },
    metadata: {
        type: Map,
        of: String
    }
}, { timestamps: true });

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
