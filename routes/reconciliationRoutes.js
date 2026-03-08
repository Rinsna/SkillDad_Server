const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/authMiddleware');
const { reconciliationValidation, resolveDiscrepancyValidation } = require('../middleware/paymentValidation');
const { reconciliationLimiter, configLimiter } = require('../middleware/rateLimiting');
const ReconciliationService = require('../services/payment/ReconciliationService');
const reconciliationService = new ReconciliationService();

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
      const { startDate, endDate } = req.body;

      // Start reconciliation process
      const reconciliation = await reconciliationService.reconcileTransactions(
        new Date(startDate),
        new Date(endDate),
        req.user.id
      );

      res.json({
        success: true,
        reconciliationId: reconciliation.id,
        status: reconciliation.status,
        message: 'Reconciliation process completed',
      });
    } catch (error) {
      console.error('Reconciliation run error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to run reconciliation process',
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
      const reconciliationId = req.params.reconciliationId;
      const reconciliation = await reconciliationService.getReconciliationReport(reconciliationId);

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
          reconciliationId: reconciliation.id,
          reconciliationDate: reconciliation.created_at,
          startDate: reconciliation.start_date,
          endDate: reconciliation.end_date,
          summary: {
            totalTransactions: reconciliation.total_transactions,
            matchedTransactions: reconciliation.matched_transactions,
            unmatchedTransactions: reconciliation.unmatched_transactions,
            totalAmount: formatAmount(reconciliation.total_amount),
            settledAmount: formatAmount(reconciliation.settled_amount),
            refundedAmount: formatAmount(reconciliation.refunded_amount),
            netSettlementAmount: formatAmount(reconciliation.net_settlement_amount),
          },
          discrepancies: (reconciliation.discrepancies || []).map(disc => ({
            transactionId: disc.transactionId,
            type: disc.type,
            systemAmount: formatAmount(disc.systemAmount),
            gatewayAmount: formatAmount(disc.gatewayAmount),
            systemStatus: disc.systemStatus,
            gatewayStatus: disc.gatewayStatus,
            resolved: disc.resolved,
            resolvedBy: disc.resolvedBy,
            resolvedAt: disc.resolvedAt,
            notes: disc.notes,
            description: disc.description
          })),
          reportUrl: reconciliation.report_url,
          performedBy: {
            id: reconciliation.performed_by,
            name: reconciliation.performed_by_name,
            email: reconciliation.performed_by_email
          },
          status: reconciliation.status,
          createdAt: reconciliation.created_at,
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
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const result = await reconciliationService.listReconciliations(page, limit);

      res.json({
        success: true,
        reconciliations: result.reconciliations.map(rec => ({
          reconciliationId: rec.id,
          reconciliationDate: rec.created_at,
          startDate: rec.start_date,
          endDate: rec.end_date,
          totalTransactions: rec.total_transactions,
          matchedTransactions: rec.matched_transactions,
          unmatchedTransactions: rec.unmatched_transactions,
          status: rec.status,
          performedBy: {
            id: rec.performed_by,
            name: rec.performed_by_name,
            email: rec.performed_by_email
          },
          createdAt: rec.created_at,
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(result.total / limit),
          totalItems: result.total,
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
      const { reconciliationId, transactionId, notes } = req.body;

      await reconciliationService.resolveDiscrepancy(
        reconciliationId,
        transactionId,
        notes,
        req.user.id
      );

      res.json({
        success: true,
        message: 'Discrepancy resolved successfully',
      });
    } catch (error) {
      console.error('Resolve discrepancy error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to resolve discrepancy',
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
      const reconciliationId = req.params.reconciliationId;
      const reconciliation = await reconciliationService.getReconciliationReport(reconciliationId);

      if (!reconciliation) {
        return res.status(404).json({
          success: false,
          message: 'Reconciliation report not found',
        });
      }

      // Generate export file
      const format = req.query.format || 'csv'; // csv or excel
      const reportUrl = await reconciliationService.generateReconciliationReport(
        reconciliation.start_date,
        reconciliation.end_date,
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
