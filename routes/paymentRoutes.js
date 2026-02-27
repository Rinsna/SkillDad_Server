const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');

// Import payment controller
const {
  initiatePayment,
  handleCallback,
  handleWebhook,
  checkPaymentStatus,
  getPaymentHistory,
  retryPayment,
} = require('../controllers/paymentController');

// Import authentication middleware
const { protect, authorize } = require('../middleware/authMiddleware');

// Import validation rules
const {
  initiatePaymentValidation,
  checkStatusValidation,
  retryPaymentValidation,
  paymentHistoryValidation,
  receiptValidation,
} = require('../middleware/paymentValidation');

// Import rate limiting middleware
const {
  paymentInitiateLimiter,
  paymentRetryLimiter,
  statusCheckLimiter,
  historyLimiter,
} = require('../middleware/rateLimiting');

// Import CSRF protection
const {
  csrfProtection,
  generateCsrfToken,
  paymentCsrfProtection,
} = require('../middleware/csrfProtection');

/**
 * Validation error handler middleware
 * Checks for validation errors and returns them in a consistent format
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
// PUBLIC ROUTES (No authentication required)
// ============================================================================

/**
 * @route   GET /api/payment/csrf-token
 * @desc    Generate CSRF token for payment initiation
 * @access  Public
 */
router.get('/csrf-token', csrfProtection, generateCsrfToken);

/**
 * @route   GET /api/payment/callback
 * @desc    Handle payment gateway callback (redirect after payment)
 * @access  Public (signature verified in controller)
 * @note    No JWT auth required - signature verification is done in the controller
 */
router.get('/callback', handleCallback);

/**
 * @route   POST /api/payment/webhook
 * @desc    Handle payment gateway webhook notifications
 * @access  Public (signature verified in controller)
 * @note    No JWT auth required - signature verification is done in the controller
 */
router.post('/webhook', handleWebhook);

// ============================================================================
// PROTECTED ROUTES (Authentication required)
// ============================================================================

/**
 * @route   POST /api/payment/initiate
 * @desc    Initiate a new payment session
 * @access  Private (Student, Admin)
 * @rateLimit 5 requests per minute per user
 */
router.post(
  '/initiate',
  protect,
  authorize('student', 'admin'),
  paymentInitiateLimiter,
  // paymentCsrfProtection,
  initiatePaymentValidation,
  handleValidationErrors,
  initiatePayment
);

/**
 * @route   GET /api/payment/status/:transactionId
 * @desc    Check payment status for a specific transaction
 * @access  Private (Student, Admin, Finance)
 * @rateLimit 10 requests per minute per user
 */
router.get(
  '/status/:transactionId',
  protect,
  authorize('student', 'admin', 'finance'),
  statusCheckLimiter,
  checkStatusValidation,
  handleValidationErrors,
  checkPaymentStatus
);

/**
 * @route   GET /api/payment/history
 * @desc    Get payment history for authenticated user
 * @access  Private (Student, Admin, Finance)
 * @rateLimit 10 requests per minute per user
 */
router.get(
  '/history',
  protect,
  authorize('student', 'admin', 'finance'),
  historyLimiter,
  paymentHistoryValidation,
  handleValidationErrors,
  getPaymentHistory
);

/**
 * @route   GET /api/payment/receipt/:transactionId
 * @desc    Download payment receipt
 * @access  Private (Student, Admin, Finance)
 * @rateLimit 10 requests per minute per user
 */
router.get(
  '/receipt/:transactionId',
  protect,
  authorize('student', 'admin', 'finance'),
  statusCheckLimiter,
  receiptValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const Transaction = require('../models/payment/Transaction');
      const transaction = await Transaction.findOne({
        transactionId: req.params.transactionId,
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found',
        });
      }

      // Check if user has access to this transaction
      if (
        req.user.role !== 'admin' &&
        req.user.role !== 'finance' &&
        transaction.student.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this receipt',
        });
      }

      if (!transaction.receiptUrl) {
        return res.status(404).json({
          success: false,
          message: 'Receipt not available for this transaction',
        });
      }

      // Redirect to receipt URL or serve the file
      res.json({
        success: true,
        receiptUrl: transaction.receiptUrl,
        receiptNumber: transaction.receiptNumber,
      });
    } catch (error) {
      console.error('Receipt retrieval error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve receipt',
      });
    }
  }
);

/**
 * @route   POST /api/payment/retry/:transactionId
 * @desc    Retry a failed payment
 * @access  Private (Student, Admin)
 * @rateLimit 3 requests per hour per transaction
 */
router.post(
  '/retry/:transactionId',
  protect,
  authorize('student', 'admin'),
  paymentRetryLimiter,
  retryPaymentValidation,
  handleValidationErrors,
  retryPayment
);

module.exports = router;
