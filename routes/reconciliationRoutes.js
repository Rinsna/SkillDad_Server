const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');

// Import authentication middleware
const { protect, authorize } = require('../middleware/authMiddleware');

// Import validation rules
const {
  reconciliationValidation,
  resolveDiscrepancyValidation,
} = require('../middleware/paymentValidation');

// Import rate limiting middleware
const {
  reconciliationLimiter,
  configLimiter,
} = require('../middleware/rateLimiting');

/**
 * Validation error handler middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
      })),
    });
  }
  next();
};

// ============================================================================
// RECONCILIATION ROUTES
// ============================================================================

/**
 * @route   POST /api/admin/reconciliation/run
 * @desc    Run reconciliation for a date range
 * @access  Private (Admin, Finance)
 * @rateLimit 10 requests per day
 */
router.post(
  '/run',
  protect,
  authorize('admin', 'finance'),
  reconciliationLimiter,
  reconciliationValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const ReconciliationService = require('../services/payment/ReconciliationService');

      const { startDate, endDate } = req.body;

      // Initialize services
      const reconciliationService = new ReconciliationService();

      // Start reconciliation process (async)
      const reconciliation = await reconciliationService.reconcileTransactions(
        new Date(startDate),
        new Date(endDate),
        req.user._id
      );

      res.json({
        success: true,
        reconciliationId: reconciliation._id,
        status: reconciliation.status,
        message: 'Reconciliation process started',
      });
    } catch (error) {
      console.error('Reconciliation run error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start reconciliation process',
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/admin/reconciliation/:reconciliationId
 * @desc    Get reconciliation report by ID
 * @access  Private (Admin, Finance)
 * @rateLimit 20 requests per minute
 */
router.get(
  '/:reconciliationId',
  protect,
  authorize('admin', 'finance'),
  configLimiter,
  async (req, res) => {
    try {
      const Reconciliation = require('../models/payment/Reconciliation');

      const reconciliation = await Reconciliation.findById(req.params.reconciliationId)
        .populate('performedBy', 'name email')
        .lean();

      if (!reconciliation) {
        return res.status(404).json({
          success: false,
          message: 'Reconciliation report not found',
        });
      }

      // Format amounts for display
      const formatAmount = (amount) => {
        return amount ? parseFloat(amount.toString()).toFixed(2) : '0.00';
      };

      res.json({
        success: true,
        report: {
          reconciliationId: reconciliation._id,
          reconciliationDate: reconciliation.reconciliationDate,
          startDate: reconciliation.startDate,
          endDate: reconciliation.endDate,
          summary: {
            totalTransactions: reconciliation.totalTransactions,
            matchedTransactions: reconciliation.matchedTransactions,
            unmatchedTransactions: reconciliation.unmatchedTransactions,
            totalAmount: formatAmount(reconciliation.totalAmount),
            settledAmount: formatAmount(reconciliation.settledAmount),
            pendingAmount: formatAmount(reconciliation.pendingAmount),
          },
          discrepancies: reconciliation.discrepancies.map(disc => ({
            transactionId: disc.transactionId,
            type: disc.type,
            systemAmount: formatAmount(disc.systemAmount),
            gatewayAmount: formatAmount(disc.gatewayAmount),
            resolved: disc.resolved,
            resolvedBy: disc.resolvedBy,
            resolvedAt: disc.resolvedAt,
            notes: disc.notes,
          })),
          reportUrl: reconciliation.reportUrl,
          performedBy: reconciliation.performedBy,
          status: reconciliation.status,
          createdAt: reconciliation.createdAt,
        },
      });
    } catch (error) {
      console.error('Get reconciliation report error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve reconciliation report',
      });
    }
  }
);

/**
 * @route   GET /api/admin/reconciliation
 * @desc    Get all reconciliation reports (paginated)
 * @access  Private (Admin, Finance)
 * @rateLimit 20 requests per minute
 */
router.get(
  '/',
  protect,
  authorize('admin', 'finance'),
  configLimiter,
  async (req, res) => {
    try {
      const Reconciliation = require('../models/payment/Reconciliation');

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const [reconciliations, total] = await Promise.all([
        Reconciliation.find()
          .populate('performedBy', 'name email')
          .sort({ reconciliationDate: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Reconciliation.countDocuments(),
      ]);

      res.json({
        success: true,
        reconciliations: reconciliations.map(rec => ({
          reconciliationId: rec._id,
          reconciliationDate: rec.reconciliationDate,
          startDate: rec.startDate,
          endDate: rec.endDate,
          totalTransactions: rec.totalTransactions,
          matchedTransactions: rec.matchedTransactions,
          unmatchedTransactions: rec.unmatchedTransactions,
          status: rec.status,
          performedBy: rec.performedBy,
          createdAt: rec.createdAt,
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      });
    } catch (error) {
      console.error('Get reconciliations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve reconciliation reports',
      });
    }
  }
);

/**
 * @route   POST /api/admin/reconciliation/resolve
 * @desc    Resolve a reconciliation discrepancy
 * @access  Private (Admin, Finance)
 * @rateLimit 20 requests per minute
 */
router.post(
  '/resolve',
  protect,
  authorize('admin', 'finance'),
  configLimiter,
  resolveDiscrepancyValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const Reconciliation = require('../models/payment/Reconciliation');
      const { reconciliationId, transactionId, notes } = req.body;

      const reconciliation = await Reconciliation.findById(reconciliationId);

      if (!reconciliation) {
        return res.status(404).json({
          success: false,
          message: 'Reconciliation report not found',
        });
      }

      // Find the discrepancy
      const discrepancy = reconciliation.discrepancies.find(
        disc => disc.transactionId === transactionId
      );

      if (!discrepancy) {
        return res.status(404).json({
          success: false,
          message: 'Discrepancy not found in this reconciliation report',
        });
      }

      if (discrepancy.resolved) {
        return res.status(400).json({
          success: false,
          message: 'This discrepancy has already been resolved',
        });
      }

      // Mark as resolved
      discrepancy.resolved = true;
      discrepancy.resolvedBy = req.user._id;
      discrepancy.resolvedAt = new Date();
      discrepancy.notes = notes;

      await reconciliation.save();

      // Log the resolution
      console.log('Discrepancy resolved:', {
        reconciliationId,
        transactionId,
        resolvedBy: req.user.email,
        notes,
        timestamp: new Date(),
      });

      res.json({
        success: true,
        message: 'Discrepancy resolved successfully',
      });
    } catch (error) {
      console.error('Resolve discrepancy error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resolve discrepancy',
      });
    }
  }
);

/**
 * @route   GET /api/admin/reconciliation/:reconciliationId/export
 * @desc    Export reconciliation report to CSV/Excel
 * @access  Private (Admin, Finance)
 * @rateLimit 20 requests per minute
 */
router.get(
  '/:reconciliationId/export',
  protect,
  authorize('admin', 'finance'),
  configLimiter,
  async (req, res) => {
    try {
      const ReconciliationService = require('../services/payment/ReconciliationService');
      const Reconciliation = require('../models/payment/Reconciliation');

      const reconciliation = await Reconciliation.findById(req.params.reconciliationId);

      if (!reconciliation) {
        return res.status(404).json({
          success: false,
          message: 'Reconciliation report not found',
        });
      }

      const reconciliationService = new ReconciliationService();

      // Generate export file
      const format = req.query.format || 'csv'; // csv or excel
      const reportUrl = await reconciliationService.generateReconciliationReport(
        reconciliation.startDate,
        reconciliation.endDate,
        format
      );

      res.json({
        success: true,
        reportUrl,
        format,
      });
    } catch (error) {
      console.error('Export reconciliation report error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export reconciliation report',
      });
    }
  }
);

module.exports = router;
