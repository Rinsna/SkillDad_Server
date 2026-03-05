const mongoose = require('mongoose');

/**
 * AuditLog Model
 * Tracks all critical exam-related actions for security and compliance
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8
 */
const auditLogSchema = new mongoose.Schema({
  // User who performed the action
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Action performed
  action: {
    type: String,
    required: true,
    enum: [
      // Exam CRUD operations
      'exam_created',
      'exam_updated',
      'exam_deleted',

      // Question paper operations
      'question_paper_uploaded',
      'question_paper_deleted',

      // Exam access
      'exam_access_granted',
      'exam_access_denied',
      'exam_started',

      // Submission operations
      'exam_submitted_manual',
      'exam_submitted_auto',
      'answer_sheet_uploaded',

      // Grading operations
      'submission_graded',
      'exam_auto_graded',

      // Result operations
      'results_published',
      'result_viewed'
    ],
    index: true
  },

  // Resource type and ID
  resource: {
    type: String,
    required: true,
    enum: ['exam', 'submission', 'result', 'question_paper', 'answer_sheet'],
    index: true
  },

  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  // Additional details about the action
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Request metadata for security analysis
  ipAddress: {
    type: String,
    required: true
  },

  userAgent: {
    type: String,
    required: true
  },

  // Timestamp (automatically managed by timestamps: true)
}, {
  timestamps: true
});

// Compound indexes for efficient querying
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
