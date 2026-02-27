const { body, param, query } = require('express-validator');

/**
 * Payment Validation Rules
 * 
 * Provides input validation for all payment endpoints using express-validator.
 * Validates data types, formats, ranges, and sanitizes inputs to prevent injection attacks.
 */

/**
 * Validation rules for payment initiation
 * POST /api/payment/initiate
 */
const initiatePaymentValidation = [
  body('courseId')
    .notEmpty()
    .withMessage('Course ID is required')
    .isMongoId()
    .withMessage('Invalid course ID format'),

  body('discountCode')
    .optional()
    .isString()
    .withMessage('Discount code must be a string')
    .trim()
    .isLength({ min: 4, max: 20 })
    .withMessage('Discount code must be between 4 and 20 characters')
    .isAlphanumeric()
    .withMessage('Discount code must contain only letters and numbers')
    .toUpperCase(),
  body('mode')
    .optional()
    .isIn(['checkout', 'elements'])
    .withMessage('Invalid payment mode'),
];

/**
 * Validation rules for checking payment status
 * GET /api/payment/status/:transactionId
 */
const checkStatusValidation = [
  param('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .matches(/^TXN_[A-Z0-9_]{10,30}$/)
    .withMessage('Invalid transaction ID format. Expected format: TXN_XXXXXXXXXX'),
];

/**
 * Validation rules for processing refunds
 * POST /api/admin/payment/refund
 */
const processRefundValidation = [
  body('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .matches(/^TXN_[A-Z0-9_]{10,30}$/)
    .withMessage('Invalid transaction ID format'),

  body('amount')
    .notEmpty()
    .withMessage('Refund amount is required')
    .isFloat({ min: 0.01, max: 500000 })
    .withMessage('Refund amount must be between 0.01 and 500,000 INR')
    .toFloat(),

  body('reason')
    .notEmpty()
    .withMessage('Refund reason is required')
    .isString()
    .withMessage('Refund reason must be a string')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Refund reason must be between 10 and 500 characters')
    .escape(),

  body('twoFactorCode')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage('2FA code must be 6 digits')
    .isNumeric()
    .withMessage('2FA code must contain only numbers'),
];

/**
 * Validation rules for payment retry
 * POST /api/payment/retry/:transactionId
 */
const retryPaymentValidation = [
  param('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .matches(/^TXN_[A-Z0-9_]{10,30}$/)
    .withMessage('Invalid transaction ID format'),
];

/**
 * Validation rules for payment history
 * GET /api/payment/history
 */
const paymentHistoryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),

  query('status')
    .optional()
    .isIn(['pending', 'processing', 'success', 'failed', 'refunded', 'partial_refund'])
    .withMessage('Invalid status value'),
];

/**
 * Validation rules for reconciliation
 * POST /api/admin/reconciliation/run
 */
const reconciliationValidation = [
  body('startDate')
    .notEmpty()
    .withMessage('Start date is required')
    .isISO8601()
    .withMessage('Start date must be in ISO 8601 format (YYYY-MM-DD)')
    .toDate(),

  body('endDate')
    .notEmpty()
    .withMessage('End date is required')
    .isISO8601()
    .withMessage('End date must be in ISO 8601 format (YYYY-MM-DD)')
    .toDate()
    .custom((endDate, { req }) => {
      if (new Date(endDate) < new Date(req.body.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
];

/**
 * Validation rules for resolving reconciliation discrepancies
 * POST /api/admin/reconciliation/resolve
 */
const resolveDiscrepancyValidation = [
  body('reconciliationId')
    .notEmpty()
    .withMessage('Reconciliation ID is required')
    .isMongoId()
    .withMessage('Invalid reconciliation ID format'),

  body('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .matches(/^TXN_[A-Z0-9_]{10,30}$/)
    .withMessage('Invalid transaction ID format'),

  body('notes')
    .notEmpty()
    .withMessage('Resolution notes are required')
    .isString()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Notes must be between 10 and 1000 characters')
    .escape(),
];

/**
 * Validation rules for gateway configuration update
 * PUT /api/admin/payment/config
 */
const updateConfigValidation = [
  body('enabledPaymentMethods')
    .optional()
    .isArray()
    .withMessage('Enabled payment methods must be an array')
    .custom((methods) => {
      const validMethods = ['credit_card', 'debit_card', 'net_banking', 'upi', 'wallet'];
      return methods.every(method => validMethods.includes(method));
    })
    .withMessage('Invalid payment method in array'),

  body('minTransactionAmount')
    .optional()
    .isFloat({ min: 1, max: 100000 })
    .withMessage('Minimum transaction amount must be between 1 and 100,000 INR')
    .toFloat(),

  body('maxTransactionAmount')
    .optional()
    .isFloat({ min: 100, max: 1000000 })
    .withMessage('Maximum transaction amount must be between 100 and 1,000,000 INR')
    .toFloat()
    .custom((maxAmount, { req }) => {
      if (req.body.minTransactionAmount && maxAmount <= req.body.minTransactionAmount) {
        throw new Error('Maximum amount must be greater than minimum amount');
      }
      return true;
    }),

  body('sessionTimeoutMinutes')
    .optional()
    .isInt({ min: 5, max: 60 })
    .withMessage('Session timeout must be between 5 and 60 minutes')
    .toInt(),
];

/**
 * Validation rules for receipt download
 * GET /api/payment/receipt/:transactionId
 */
const receiptValidation = [
  param('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .matches(/^TXN_[A-Z0-9_]{10,30}$/)
    .withMessage('Invalid transaction ID format'),
];

/**
 * Validation rules for monitoring metrics
 * GET /api/admin/monitoring/metrics
 */
const metricsValidation = [
  query('timeRange')
    .optional()
    .isIn(['24h', '7d', '30d'])
    .withMessage('Time range must be one of: 24h, 7d, 30d'),
];

module.exports = {
  initiatePaymentValidation,
  checkStatusValidation,
  processRefundValidation,
  retryPaymentValidation,
  paymentHistoryValidation,
  reconciliationValidation,
  resolveDiscrepancyValidation,
  updateConfigValidation,
  receiptValidation,
  metricsValidation,
};
