const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');

// Import payment controller
const { processRefund } = require('../controllers/paymentController');

// Import admin config controller
const adminConfigController = require('../controllers/AdminConfigController');

// Import authentication middleware
const { protect, authorize } = require('../middleware/authMiddleware');

// Import validation rules
const {
  processRefundValidation,
  updateConfigValidation,
} = require('../middleware/paymentValidation');

// Import rate limiting middleware
const {
  refundLimiter,
  configLimiter,
} = require('../middleware/rateLimiting');

// Import CSRF protection
const { adminCsrfProtection } = require('../middleware/csrfProtection');

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
// ADMIN PAYMENT ROUTES
// ============================================================================

/**
 * @route   POST /api/admin/payment/refund
 * @desc    Process a refund for a completed payment
 * @access  Private (Admin, Finance) + 2FA required
 * @rateLimit 10 requests per hour per admin
 */
router.post(
  '/refund',
  protect,
  authorize('admin', 'finance'),
  refundLimiter,
  adminCsrfProtection,
  processRefundValidation,
  handleValidationErrors,
  processRefund
);

/**
 * @route   GET /api/admin/payment/config
 * @desc    Get current payment gateway configuration
 * @access  Private (Admin only)
 * @rateLimit 20 requests per minute
 */
router.get(
  '/config',
  protect,
  authorize('admin'),
  configLimiter,
  adminConfigController.getGatewayConfig.bind(adminConfigController)
);

/**
 * @route   PUT /api/admin/payment/config
 * @desc    Update payment gateway configuration
 * @access  Private (Admin only)
 * @rateLimit 5 requests per minute
 */
router.put(
  '/config',
  protect,
  authorize('admin'),
  configLimiter,
  adminCsrfProtection,
  updateConfigValidation,
  handleValidationErrors,
  adminConfigController.updateGatewayConfig.bind(adminConfigController)
);

/**
  * @route   POST /api/admin/payment/test-connection
 * @desc    Test connection to payment gateway
 * @access  Private (Admin only)
 * @rateLimit 5 requests per minute
 */
router.post(
  '/test-connection',
  protect,
  authorize('admin'),
  configLimiter,
  adminConfigController.testGatewayConnection.bind(adminConfigController)
);

/**
 * @route   GET /api/admin/payment/transactions
 * @desc    Get all payment transactions (admin view)
 * @access  Private (Admin, Finance)
 * @rateLimit 20 requests per minute
 */
router.get(
  '/transactions',
  protect,
  authorize('admin', 'finance'),
  configLimiter,
  adminConfigController.getAllTransactions.bind(adminConfigController)
);

module.exports = router;
