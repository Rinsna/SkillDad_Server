const mongoose = require('mongoose');

/**
 * Payment Session Model
 * 
 * This model stores temporary payment session data for active payment transactions.
 * Sessions automatically expire after 15 minutes using MongoDB TTL index.
 */
const paymentSessionSchema = mongoose.Schema({
  // Session Identification
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: 'Unique session identifier'
  },

  // Transaction Reference
  transactionId: {
    type: String,
    required: true,
    ref: 'Transaction',
    description: 'Reference to the associated transaction'
  },

  // User and Course Information
  student: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    description: 'Reference to the student making the payment'
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Course',
    description: 'Reference to the course being purchased'
  },

  // Amount Information
  amount: {
    type: mongoose.Types.Decimal128,
    required: true,
    description: 'Payment amount for this session'
  },

  // Session Status
  status: {
    type: String,
    enum: ['active', 'completed', 'expired', 'cancelled'],
    default: 'active',
    description: 'Current status of the payment session'
  },

  // Session Metadata
  ipAddress: {
    type: String,
    description: 'IP address of the user initiating the session'
  },
  userAgent: {
    type: String,
    description: 'User agent string from the browser'
  },

  // Gateway Data
  gatewaySessionData: {
    type: mongoose.Schema.Types.Mixed,
    description: 'Additional session data from gateway'
  },

  // Expiration
  expiresAt: {
    type: Date,
    required: true,
    index: true,
    description: 'Session expiration timestamp'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 900, // TTL index: Auto-delete after 15 minutes (900 seconds)
    description: 'Session creation timestamp'
  },

  // Completion Tracking
  completedAt: {
    type: Date,
    description: 'Timestamp when session was completed'
  },
  cancelledAt: {
    type: Date,
    description: 'Timestamp when session was cancelled'
  },

}, {
  timestamps: false, // Using custom createdAt with TTL
});

// Indexes for performance
paymentSessionSchema.index({ transactionId: 1 });
paymentSessionSchema.index({ student: 1, status: 1 });
paymentSessionSchema.index({ status: 1, expiresAt: 1 });

// TTL index for automatic expiration after 15 minutes
// MongoDB will automatically delete documents where createdAt is older than 900 seconds
paymentSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

// Virtual for formatted amount
paymentSessionSchema.virtual('amountFormatted').get(function () {
  if (!this.amount) return '0.00';
  return parseFloat(this.amount.toString()).toFixed(2);
});

// Virtual to check if session is expired
paymentSessionSchema.virtual('isExpired').get(function () {
  return new Date() > this.expiresAt;
});

// Virtual to get remaining time in seconds
paymentSessionSchema.virtual('remainingTimeSeconds').get(function () {
  const now = new Date();
  const remaining = Math.floor((this.expiresAt - now) / 1000);
  return remaining > 0 ? remaining : 0;
});

// Methods

/**
 * Mark session as completed
 * @returns {Promise<Object>} Updated session
 */
paymentSessionSchema.methods.markCompleted = async function () {
  this.status = 'completed';
  this.completedAt = new Date();
  return await this.save();
};

/**
 * Mark session as cancelled
 * @returns {Promise<Object>} Updated session
 */
paymentSessionSchema.methods.markCancelled = async function () {
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  return await this.save();
};

/**
 * Mark session as expired
 * @returns {Promise<Object>} Updated session
 */
paymentSessionSchema.methods.markExpired = async function () {
  this.status = 'expired';
  return await this.save();
};

/**
 * Validate if session is still active and not expired
 * @returns {Boolean} Whether session is valid
 */
paymentSessionSchema.methods.isValid = function () {
  return this.status === 'active' && !this.isExpired;
};

// Static Methods

/**
 * Find active session by session ID
 * @param {String} sessionId - Session identifier
 * @returns {Promise<Object>} Active session or null
 */
paymentSessionSchema.statics.findActiveSession = async function (sessionId) {
  const session = await this.findOne({
    sessionId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  return session;
};

/**
 * Find active sessions for a student
 * @param {String} studentId - Student ID
 * @returns {Promise<Array>} Array of active sessions
 */
paymentSessionSchema.statics.findActiveSessionsForStudent = async function (studentId) {
  return await this.find({
    student: studentId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

/**
 * Clean up expired sessions (manual cleanup if TTL index is not working)
 * @returns {Promise<Object>} Deletion result
 */
paymentSessionSchema.statics.cleanupExpiredSessions = async function () {
  return await this.updateMany(
    {
      status: 'active',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
};

/**
 * Get session statistics
 * @returns {Promise<Object>} Session statistics
 */
paymentSessionSchema.statics.getStatistics = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  return stats.reduce((acc, stat) => {
    acc[stat._id] = stat.count;
    return acc;
  }, {});
};

// Ensure virtuals are included in JSON output
paymentSessionSchema.set('toJSON', { virtuals: true });
paymentSessionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('PaymentSession', paymentSessionSchema);
