const csrf = require('csurf');

/**
 * CSRF Protection Middleware
 * 
 * Implements Cross-Site Request Forgery (CSRF) protection for payment endpoints.
 * Uses double-submit cookie pattern with secure, httpOnly cookies.
 * 
 * CSRF tokens are required for:
 * - Payment initiation
 * - Refund operations
 * - Configuration updates
 * 
 * Callback and webhook routes do NOT require CSRF tokens as they use signature verification.
 */

/**
 * CSRF protection middleware configuration
 * Uses cookie-based token storage for stateless operation
 */
const csrfProtection = csrf({
  cookie: {
    httpOnly: true, // Prevent JavaScript access to cookie
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict', // Strict same-site policy
    maxAge: 3600000, // 1 hour
  },
  // Custom error handler
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
});

/**
 * CSRF token generation endpoint
 * GET /api/payment/csrf-token
 * 
 * Generates and returns a CSRF token for the client to use in subsequent requests.
 * The token is also stored in a secure cookie.
 */
const generateCsrfToken = (req, res) => {
  try {
    const token = req.csrfToken();
    res.json({
      success: true,
      csrfToken: token,
    });
  } catch (error) {
    console.error('CSRF token generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate CSRF token',
    });
  }
};

/**
 * CSRF error handler middleware
 * Provides user-friendly error messages for CSRF validation failures
 */
const csrfErrorHandler = (err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    // CSRF token validation failed
    console.warn('CSRF validation failed:', {
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
      userAgent: req.get('user-agent'),
    });

    return res.status(403).json({
      success: false,
      message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
      code: 'CSRF_VALIDATION_FAILED',
    });
  }
  
  // Pass other errors to the next error handler
  next(err);
};

/**
 * Conditional CSRF protection
 * Applies CSRF protection only to specific routes that need it
 * 
 * Routes that need CSRF:
 * - POST /api/payment/initiate
 * - POST /api/admin/payment/refund
 * - PUT /api/admin/payment/config
 * 
 * Routes that DON'T need CSRF (use signature verification instead):
 * - GET /api/payment/callback
 * - POST /api/payment/webhook
 */
const conditionalCsrfProtection = (req, res, next) => {
  // Skip CSRF for callback and webhook endpoints (they use signature verification)
  const skipCsrfPaths = [
    '/api/payment/callback',
    '/api/payment/webhook',
  ];

  if (skipCsrfPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Apply CSRF protection for other routes
  return csrfProtection(req, res, next);
};

/**
 * CSRF protection for payment initiation
 * Specifically for POST /api/payment/initiate
 */
const paymentCsrfProtection = [
  csrfProtection,
  csrfErrorHandler,
];

/**
 * CSRF protection for admin operations
 * Specifically for admin refund and configuration endpoints
 */
const adminCsrfProtection = [
  csrfProtection,
  csrfErrorHandler,
];

module.exports = {
  csrfProtection,
  generateCsrfToken,
  csrfErrorHandler,
  conditionalCsrfProtection,
  paymentCsrfProtection,
  adminCsrfProtection,
};
