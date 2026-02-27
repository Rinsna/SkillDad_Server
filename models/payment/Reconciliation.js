const mongoose = require('mongoose');

/**
 * Reconciliation Model for Payment Integration
 * 
 * This model tracks reconciliation operations between SkillDad transaction records
 * and payment gateway settlement reports.
 */
const reconciliationSchema = mongoose.Schema({
  // Reconciliation Period
  reconciliationDate: {
    type: Date,
    required: true,
    index: true,
    description: 'Date when reconciliation was performed'
  },
  startDate: {
    type: Date,
    required: true,
    description: 'Start date of the reconciliation period'
  },
  endDate: {
    type: Date,
    required: true,
    description: 'End date of the reconciliation period'
  },

  // Summary Statistics
  totalTransactions: {
    type: Number,
    default: 0,
    description: 'Total number of transactions in the period'
  },
  matchedTransactions: {
    type: Number,
    default: 0,
    description: 'Number of transactions that matched between system and gateway'
  },
  unmatchedTransactions: {
    type: Number,
    default: 0,
    description: 'Number of transactions that did not match'
  },

  // Transaction Count Breakdown
  successfulTransactions: {
    type: Number,
    default: 0,
    description: 'Number of successful transactions'
  },
  failedTransactions: {
    type: Number,
    default: 0,
    description: 'Number of failed transactions'
  },
  refundedTransactions: {
    type: Number,
    default: 0,
    description: 'Number of refunded transactions'
  },

  // Amount Summary (using Decimal128 for precision)
  totalAmount: {
    type: mongoose.Types.Decimal128,
    default: 0,
    description: 'Total transaction amount in the period'
  },
  settledAmount: {
    type: mongoose.Types.Decimal128,
    default: 0,
    description: 'Amount settled by the gateway'
  },
  pendingAmount: {
    type: mongoose.Types.Decimal128,
    default: 0,
    description: 'Amount pending settlement'
  },
  refundedAmount: {
    type: mongoose.Types.Decimal128,
    default: 0,
    description: 'Total amount refunded'
  },

  // Gateway Fees
  gatewayFees: {
    type: mongoose.Types.Decimal128,
    default: 0,
    description: 'Total gateway fees deducted'
  },
  netSettlementAmount: {
    type: mongoose.Types.Decimal128,
    default: 0,
    description: 'Net amount after gateway fees'
  },

  // Discrepancies
  discrepancies: [{
    transactionId: {
      type: String,
      required: true,
      description: 'Transaction ID with discrepancy'
    },
    type: {
      type: String,
      enum: ['missing_in_system', 'missing_in_gateway', 'amount_mismatch', 'status_mismatch'],
      required: true,
      description: 'Type of discrepancy'
    },
    systemAmount: {
      type: mongoose.Types.Decimal128,
      description: 'Amount recorded in SkillDad system'
    },
    gatewayAmount: {
      type: mongoose.Types.Decimal128,
      description: 'Amount recorded in gateway settlement'
    },
    systemStatus: {
      type: String,
      description: 'Status in SkillDad system'
    },
    gatewayStatus: {
      type: String,
      description: 'Status in gateway settlement'
    },
    description: {
      type: String,
      description: 'Detailed description of the discrepancy'
    },
    resolved: {
      type: Boolean,
      default: false,
      description: 'Whether discrepancy has been resolved'
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'Finance team member who resolved the discrepancy'
    },
    resolvedAt: {
      type: Date,
      description: 'Timestamp when discrepancy was resolved'
    },
    resolutionNotes: {
      type: String,
      description: 'Notes about how discrepancy was resolved'
    },
    resolutionAction: {
      type: String,
      enum: ['manual_adjustment', 'gateway_correction', 'system_correction', 'accepted_difference', 'other'],
      description: 'Action taken to resolve discrepancy'
    }
  }],

  // Report Information
  reportUrl: {
    type: String,
    description: 'URL to download the reconciliation report (CSV/Excel)'
  },
  gatewayReportUrl: {
    type: String,
    description: 'URL to the gateway settlement report'
  },
  reportGeneratedAt: {
    type: Date,
    description: 'Timestamp when report was generated'
  },

  // Audit Information
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    description: 'Finance team member who performed reconciliation'
  },

  // Status
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'failed', 'pending_review'],
    default: 'in_progress',
    description: 'Current status of reconciliation'
  },

  // Completion Information
  completedAt: {
    type: Date,
    description: 'Timestamp when reconciliation was completed'
  },

  // Error Tracking
  errorMessage: {
    type: String,
    description: 'Error message if reconciliation failed'
  },

  // Notes
  notes: {
    type: String,
    description: 'Additional notes about this reconciliation'
  },

  // Automation
  isAutomated: {
    type: Boolean,
    default: false,
    description: 'Whether this was an automated reconciliation'
  },

  // Notification
  notificationSent: {
    type: Boolean,
    default: false,
    description: 'Whether notification email was sent'
  },
  notificationSentAt: {
    type: Date,
    description: 'Timestamp when notification was sent'
  },

}, {
  timestamps: true,
});

// Indexes for performance
reconciliationSchema.index({ reconciliationDate: -1 });
reconciliationSchema.index({ status: 1, reconciliationDate: -1 });
reconciliationSchema.index({ startDate: 1, endDate: 1 });
reconciliationSchema.index({ performedBy: 1, reconciliationDate: -1 });

// Virtual for formatted amounts
reconciliationSchema.virtual('totalAmountFormatted').get(function () {
  if (!this.totalAmount) return '0.00';
  return parseFloat(this.totalAmount.toString()).toFixed(2);
});

reconciliationSchema.virtual('settledAmountFormatted').get(function () {
  if (!this.settledAmount) return '0.00';
  return parseFloat(this.settledAmount.toString()).toFixed(2);
});

reconciliationSchema.virtual('pendingAmountFormatted').get(function () {
  if (!this.pendingAmount) return '0.00';
  return parseFloat(this.pendingAmount.toString()).toFixed(2);
});

reconciliationSchema.virtual('netSettlementAmountFormatted').get(function () {
  if (!this.netSettlementAmount) return '0.00';
  return parseFloat(this.netSettlementAmount.toString()).toFixed(2);
});

// Virtual for reconciliation rate
reconciliationSchema.virtual('reconciliationRate').get(function () {
  if (this.totalTransactions === 0) return 0;
  return ((this.matchedTransactions / this.totalTransactions) * 100).toFixed(2);
});

// Virtual for unresolved discrepancies count
reconciliationSchema.virtual('unresolvedDiscrepanciesCount').get(function () {
  return this.discrepancies.filter(d => !d.resolved).length;
});

// Methods

/**
 * Mark reconciliation as completed
 * @returns {Promise<Object>} Updated reconciliation
 */
reconciliationSchema.methods.markCompleted = async function () {
  this.status = 'completed';
  this.completedAt = new Date();
  return await this.save();
};

/**
 * Mark reconciliation as failed
 * @param {String} errorMessage - Error message
 * @returns {Promise<Object>} Updated reconciliation
 */
reconciliationSchema.methods.markFailed = async function (errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  return await this.save();
};

/**
 * Add a discrepancy to the reconciliation
 * @param {Object} discrepancy - Discrepancy details
 * @returns {Promise<Object>} Updated reconciliation
 */
reconciliationSchema.methods.addDiscrepancy = async function (discrepancy) {
  this.discrepancies.push(discrepancy);
  this.unmatchedTransactions = this.discrepancies.length;
  return await this.save();
};

/**
 * Resolve a discrepancy
 * @param {String} transactionId - Transaction ID
 * @param {String} userId - User resolving the discrepancy
 * @param {String} notes - Resolution notes
 * @param {String} action - Resolution action
 * @returns {Promise<Object>} Updated reconciliation
 */
reconciliationSchema.methods.resolveDiscrepancy = async function (transactionId, userId, notes, action) {
  const discrepancy = this.discrepancies.find(d => d.transactionId === transactionId);

  if (!discrepancy) {
    throw new Error('Discrepancy not found');
  }

  discrepancy.resolved = true;
  discrepancy.resolvedBy = userId;
  discrepancy.resolvedAt = new Date();
  discrepancy.resolutionNotes = notes;
  discrepancy.resolutionAction = action;

  return await this.save();
};

/**
 * Calculate summary statistics
 * @returns {Object} Summary statistics
 */
reconciliationSchema.methods.calculateSummary = function () {
  return {
    totalTransactions: this.totalTransactions,
    matchedTransactions: this.matchedTransactions,
    unmatchedTransactions: this.unmatchedTransactions,
    reconciliationRate: this.reconciliationRate,
    totalAmount: this.totalAmountFormatted,
    settledAmount: this.settledAmountFormatted,
    pendingAmount: this.pendingAmountFormatted,
    unresolvedDiscrepancies: this.unresolvedDiscrepanciesCount
  };
};

// Static Methods

/**
 * Get latest reconciliation
 * @returns {Promise<Object>} Latest reconciliation record
 */
reconciliationSchema.statics.getLatest = async function () {
  return await this.findOne()
    .sort({ reconciliationDate: -1 })
    .populate('performedBy', 'name email');
};

/**
 * Get reconciliations for a date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of reconciliation records
 */
reconciliationSchema.statics.getByDateRange = async function (startDate, endDate) {
  return await this.find({
    reconciliationDate: {
      $gte: startDate,
      $lte: endDate
    }
  })
    .sort({ reconciliationDate: -1 })
    .populate('performedBy', 'name email');
};

/**
 * Get reconciliations with unresolved discrepancies
 * @returns {Promise<Array>} Array of reconciliation records
 */
reconciliationSchema.statics.getWithUnresolvedDiscrepancies = async function () {
  return await this.find({
    'discrepancies.resolved': false
  })
    .sort({ reconciliationDate: -1 })
    .populate('performedBy', 'name email');
};

/**
 * Get reconciliation statistics
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Aggregated statistics
 */
reconciliationSchema.statics.getStatistics = async function (startDate, endDate) {
  const stats = await this.aggregate([
    {
      $match: {
        reconciliationDate: {
          $gte: startDate,
          $lte: endDate
        },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalReconciliations: { $sum: 1 },
        totalTransactions: { $sum: '$totalTransactions' },
        totalMatched: { $sum: '$matchedTransactions' },
        totalUnmatched: { $sum: '$unmatchedTransactions' },
        totalAmount: { $sum: { $toDouble: '$totalAmount' } },
        totalSettled: { $sum: { $toDouble: '$settledAmount' } }
      }
    }
  ]);

  return stats[0] || {
    totalReconciliations: 0,
    totalTransactions: 0,
    totalMatched: 0,
    totalUnmatched: 0,
    totalAmount: 0,
    totalSettled: 0
  };
};

// Ensure virtuals are included in JSON output
reconciliationSchema.set('toJSON', { virtuals: true });
reconciliationSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Reconciliation', reconciliationSchema);
