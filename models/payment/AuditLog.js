const mongoose = require('mongoose');

const auditLogSchema = mongoose.Schema({
  // Event Information
  event: {
    type: String,
    required: true,
    enum: [
      'payment_attempt',
      'payment_success',
      'payment_failure',
      'signature_verification_failed',
      'refund_processed',
      'refund_failed',
      'config_updated',
      'unauthorized_access',
      'session_expired',
      'webhook_received',
      'callback_received'
    ],
    index: true,
  },
  
  // Transaction Reference
  transactionId: {
    type: String,
    index: true,
  },
  
  // User Information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  
  // Request Information
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  
  // Event Details
  details: {
    type: mongoose.Schema.Types.Mixed,
  },
  
  // Severity Level
  severity: {
    type: String,
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info',
  },
  
  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
});

// Index for efficient querying
auditLogSchema.index({ event: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ transactionId: 1, timestamp: -1 });

// TTL index for automatic deletion after 7 years (as per requirement 14.5)
// 7 years = 7 * 365 * 24 * 60 * 60 seconds = 220752000 seconds
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 220752000 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
