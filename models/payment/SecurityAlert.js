const mongoose = require('mongoose');

const securityAlertSchema = mongoose.Schema({
  // Alert Information
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true,
    index: true,
  },
  
  event: {
    type: String,
    required: true,
  },
  
  // Location Information
  endpoint: {
    type: String,
  },
  
  ipAddress: {
    type: String,
    index: true,
  },
  
  // Alert Details
  data: {
    type: mongoose.Schema.Types.Mixed,
  },
  
  description: {
    type: String,
  },
  
  // Status
  status: {
    type: String,
    enum: ['open', 'investigating', 'resolved', 'false_positive'],
    default: 'open',
    index: true,
  },
  
  // Resolution
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  resolvedAt: {
    type: Date,
  },
  
  resolutionNotes: {
    type: String,
  },
  
  // Notification
  notificationSent: {
    type: Boolean,
    default: false,
  },
  
  notificationSentAt: {
    type: Date,
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

// Indexes for efficient querying
securityAlertSchema.index({ severity: 1, status: 1, timestamp: -1 });
securityAlertSchema.index({ ipAddress: 1, timestamp: -1 });

const SecurityAlert = mongoose.model('SecurityAlert', securityAlertSchema);

module.exports = SecurityAlert;
