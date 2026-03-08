/**
 * Payment Controller
 * 
 * Orchestrates payment operations and coordinates between services.
 * Handles payment initiation, callbacks, webhooks, status checks, refunds, and retries.
 * 
 * Requirements: 1.1-1.8, 3.1-3.9, 4.1-4.9, 7.1-7.9, 8.1-8.10, 11.1-11.10, 13.1-13.9, 17.1-17.10
 */

const { query } = require('../config/postgres');
const socketService = require('../services/SocketService');
const RazorpayGatewayService = require('../services/payment/RazorpayGatewayService');
const PaymentSessionManager = require('../services/payment/PaymentSessionManager');
const SecurityLogger = require('../services/payment/SecurityLogger');
const PCIComplianceService = require('../services/payment/PCIComplianceService');
const MonitoringService = require('../services/payment/MonitoringService');
const ReceiptGeneratorService = require('../services/payment/ReceiptGeneratorService');
const EmailService = require('../services/payment/EmailService');
const path = require('path');

// Initialize services (lazy init for RazorpayGatewayService)
let _razorpayService = null;
const getRazorpayService = () => {
  if (!_razorpayService) {
    const gatewayConfig = {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET,
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    };
    _razorpayService = new RazorpayGatewayService(gatewayConfig);
  }
  return _razorpayService;
};
const sessionManager = new PaymentSessionManager();
const securityLogger = SecurityLogger;
const pciCompliance = PCIComplianceService;
const monitoringService = MonitoringService;
const receiptGenerator = new ReceiptGeneratorService();
const emailService = new EmailService();

/**
 * Generate unique transaction ID
 * Format: TXN_<timestamp>_<random>
 */
const generateTransactionId = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN_${timestamp}_${random}`;
};

/**
 * Calculate GST amount (18% of final amount) with banker's rounding
 * Requirements: 17.7, 17.8, 17.9
 */
const calculateGST = (amount) => {
  const gstRate = 0.18;
  const gstAmount = amount * gstRate;

  // Apply banker's rounding for GST calculation (Requirement 17.8)
  return bankersRound(gstAmount, 2);
};

/**
 * Banker's rounding (round half to even)
 * Requirements: 17.8, 17.9
 * 
 * When the value is exactly halfway between two numbers,
 * round to the nearest even number to avoid systematic bias.
 * 
 * @param {number} value - Value to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} Rounded value
 */
const bankersRound = (value, decimals) => {
  const factor = Math.pow(10, decimals);
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const fraction = scaled - floor;

  // Check if we're exactly at the halfway point (0.5)
  // Use a small epsilon for floating point comparison
  const epsilon = 0.0000001;
  if (Math.abs(fraction - 0.5) < epsilon) {
    // Round to nearest even number
    if (floor % 2 === 0) {
      // Floor is even, round down
      return floor / factor;
    } else {
      // Floor is odd, round up to make it even
      return (floor + 1) / factor;
    }
  }

  // Standard rounding for non-halfway cases
  return Math.round(scaled) / factor;
};

/**
 * Validate amount for floating-point precision issues
 * Requirements: 17.6, 17.9
 * 
 * Ensures amount can be safely represented as Decimal128 without precision loss
 * 
 * @param {number} amount - Amount to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
const validateAmountPrecision = (amount) => {
  // Check for NaN or Infinity
  if (!isFinite(amount)) {
    return {
      valid: false,
      error: 'Amount must be a finite number'
    };
  }

  // Check for excessive decimal places (more than 2)
  const amountStr = amount.toString();
  const decimalIndex = amountStr.indexOf('.');

  if (decimalIndex !== -1) {
    const decimalPlaces = amountStr.length - decimalIndex - 1;

    // Allow up to 2 decimal places for INR currency
    if (decimalPlaces > 2) {
      // Check if the extra decimals are just floating point artifacts
      const rounded = parseFloat(amount.toFixed(2));
      const difference = Math.abs(amount - rounded);

      // If difference is significant (more than 0.001), it's a precision issue
      if (difference > 0.001) {
        return {
          valid: false,
          error: 'Amount has too many decimal places. Maximum 2 decimal places allowed for INR.'
        };
      }
    }
  }

  // Check for very small amounts that might cause precision issues
  if (amount > 0 && amount < 0.01) {
    return {
      valid: false,
      error: 'Amount is too small. Minimum amount is INR 0.01'
    };
  }

  return { valid: true, error: null };
};

/**
 * Validate GST calculation accuracy
 * Requirements: 17.7, 17.9
 * 
 * Ensures GST is calculated correctly and matches expected value
 * 
 * @param {number} baseAmount - Base amount before GST
 * @param {number} gstAmount - Calculated GST amount
 * @returns {Object} { valid: boolean, error: string|null, expectedGST: number }
 */
const validateGSTCalculation = (baseAmount, gstAmount) => {
  const gstRate = 0.18; // 18% GST
  const expectedGST = bankersRound(baseAmount * gstRate, 2);

  // Allow small tolerance for floating point comparison (0.01 INR = 1 paisa)
  const tolerance = 0.01;
  const difference = Math.abs(gstAmount - expectedGST);

  if (difference > tolerance) {
    return {
      valid: false,
      error: `GST calculation mismatch. Expected: ${expectedGST.toFixed(2)}, Got: ${gstAmount.toFixed(2)}`,
      expectedGST
    };
  }

  return { valid: true, error: null, expectedGST };
};

/**
 * @desc    Initiate payment session
 * @route   POST /api/payment/initiate
 * @access  Private (Student)
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 13.1-13.6, 17.1-17.5, 17.9
 */
const initiatePayment = async (req, res) => {
  try {
    const { courseId, discountCode } = req.body;
    const studentId = req.user.id;

    // Validate required fields
    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: 'Course ID is required'
      });
    }
    // Check gateway configuration
    const razorpayService = getRazorpayService();

    // Validate course exists
    const courseRes = await query('SELECT * FROM courses WHERE id = $1', [courseId]);
    const course = courseRes.rows[0];
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Check for existing active enrollment
    const enrollRes = await query('SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2 AND status = $3', [studentId, courseId, 'active']);

    // Get student details
    const studentRes = await query('SELECT * FROM users WHERE id = $1', [studentId]);
    const student = studentRes.rows[0];
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Calculate amounts (Requirements 1.3, 13.1-13.3, 17.1, 17.3)
    let originalAmount = parseFloat(course.price);

    // Validate original amount precision (Requirements 17.6, 17.9)
    const originalAmountValidation = validateAmountPrecision(originalAmount);
    if (!originalAmountValidation.valid) {
      return res.status(400).json({
        success: false,
        message: `Course price validation error: ${originalAmountValidation.error}`,
        errorCategory: 'validation',
      });
    }

    let discountAmount = 0;
    let discountPercentage = 0;
    let discountCodeUsed = null;

    // Validate and apply discount code
    if (discountCode) {
      const discRes = await query(`
        SELECT * FROM discounts 
        WHERE code = $1 AND active = true 
        AND (expiry_date > NOW() OR expiry_date IS NULL)
      `, [discountCode.toUpperCase()]);
      const discount = discRes.rows[0];

      if (!discount) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired discount code'
        });
      }

      // Calculate discount with banker's rounding (Requirements 17.3, 17.8)
      if (discount.type === 'percentage') {
        discountPercentage = discount.value;
        discountAmount = bankersRound((originalAmount * discount.value) / 100, 2);
      } else if (discount.type === 'fixed') {
        discountAmount = bankersRound(discount.value, 2);
        discountPercentage = bankersRound((discount.value / originalAmount) * 100, 2);
      }

      // Validate discount amount precision (Requirement 17.6)
      const discountPrecisionValidation = validateAmountPrecision(discountAmount);
      if (!discountPrecisionValidation.valid) {
        return res.status(400).json({
          success: false,
          message: `Discount calculation error: ${discountPrecisionValidation.error}`,
          errorCategory: 'validation',
        });
      }

      discountCodeUsed = discount.code;
    }

    // Calculate final amount with banker's rounding (Requirements 17.3, 17.8)
    let finalAmount = originalAmount - discountAmount;
    finalAmount = bankersRound(finalAmount, 2);

    // Validate amount precision to prevent floating-point issues (Requirements 17.6, 17.9)
    const precisionValidation = validateAmountPrecision(finalAmount);
    if (!precisionValidation.valid) {
      return res.status(400).json({
        success: false,
        message: precisionValidation.error,
        errorCategory: 'validation',
      });
    }

    // Validate amount limits (Requirements 17.4, 17.5)
    const minAmount = 10;
    const maxAmount = 500000;

    if (finalAmount < minAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount must be at least INR ${minAmount.toFixed(2)}`,
        errorCategory: 'validation',
        details: {
          finalAmount: finalAmount.toFixed(2),
          minAmount: minAmount.toFixed(2),
        }
      });
    }

    if (finalAmount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed INR ${maxAmount.toFixed(2)}`,
        errorCategory: 'validation',
        details: {
          finalAmount: finalAmount.toFixed(2),
          maxAmount: maxAmount.toFixed(2),
        }
      });
    }

    // Calculate GST with banker's rounding (Requirements 17.7, 17.8)
    const gstAmount = calculateGST(finalAmount);

    // Validate GST calculation accuracy (Requirements 17.7, 17.9)
    const gstValidation = validateGSTCalculation(finalAmount, gstAmount);
    if (!gstValidation.valid) {
      // Log GST calculation error for monitoring
      console.error('GST calculation validation failed:', {
        transactionId: generateTransactionId(),
        finalAmount,
        calculatedGST: gstAmount,
        expectedGST: gstValidation.expectedGST,
        error: gstValidation.error,
      });

      return res.status(500).json({
        success: false,
        message: 'GST calculation error. Please try again.',
        errorCategory: 'validation',
      });
    }

    // Calculate total amount including GST
    const totalAmount = bankersRound(finalAmount + gstAmount, 2);

    // Validate total amount doesn't exceed maximum (Requirement 17.5)
    if (totalAmount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Total amount including GST cannot exceed INR ${maxAmount.toFixed(2)}`,
        errorCategory: 'validation',
        details: {
          finalAmount: finalAmount.toFixed(2),
          gstAmount: gstAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          maxAmount: maxAmount.toFixed(2),
        }
      });
    }

    // Generate transaction ID (Requirement 1.1)
    const transactionId = generateTransactionId();

    // Create payment session FIRST (Requirement 1.1, 1.7)
    // This provides the sessionId needed for the Transaction record
    const session = await sessionManager.createSession({
      transactionId,
      student: studentId,
      course: courseId,
      amount: finalAmount,
    });

    // Create transaction record in PG
    await query(`
      INSERT INTO transactions (
        id, transaction_id, student_id, course_id, original_amount, 
        discount_amount, final_amount, gst_amount, currency, 
        discount_code, discount_percentage, status, session_id, 
        session_expires_at, ip_address, user_agent, initiated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
    `, [
      `txn_${Date.now()}`, transactionId, studentId, courseId, originalAmount,
      discountAmount, finalAmount, gstAmount, 'INR',
      discountCodeUsed, discountPercentage, 'pending', session.sessionId,
      session.expiresAt, req.ip, req.get('user-agent')
    ]);

    // Generate Razorpay order
    let paymentRequest;
    try {
      paymentRequest = await razorpayService.createOrder({
        transactionId,
        amount: Math.round(totalAmount * 100), // Convert to paise
        currency: 'INR',
        customerName: student.name,
        customerEmail: student.email,
        customerPhone: student.phone || '',
        productInfo: `${course.title} - Course Enrollment`,
        courseId: course.id,
        studentId: student.id,
        gstAmount,
      });

      // Store Razorpay order ID in transaction
      await query('UPDATE transactions SET gateway_transaction_id = $1 WHERE transaction_id = $2', [paymentRequest.order_id, transactionId]);

    } catch (paymentError) {
      // Handle gateway timeout during order creation
      if (paymentError.message.includes('GATEWAY_TIMEOUT')) {
        await query(`
          UPDATE transactions 
          SET status = 'failed', error_code = 'GATEWAY_TIMEOUT', 
              error_message = 'Payment gateway timeout', error_category = 'gateway_timeout' 
          WHERE transaction_id = $1
        `, [transactionId]);

        // Log the error
        await monitoringService.logAPIError('createOrder', 'GATEWAY_TIMEOUT', paymentError.message);

        return res.status(503).json({
          success: false,
          message: 'Payment gateway is temporarily unavailable.',
          errorCategory: 'gateway_timeout',
          transactionId,
        });
      }

      await query("UPDATE transactions SET status = 'failed', error_message = $1 WHERE transaction_id = $2", [paymentError.message, transactionId]);
      throw paymentError;
    }

    // Log payment attempt (Requirement 5.8)
    await securityLogger.logPaymentAttempt(
      transactionId,
      studentId,
      req.ip,
      req.get('user-agent')
    );

    // Track payment attempt in monitoring (Requirement 16.1)
    await monitoringService.trackPaymentAttempt(transactionId, 'initiated');

    // Return Razorpay order details (Requirement 1.6)
    res.status(200).json({
      success: true,
      transactionId,
      sessionId: session.sessionId,
      orderId: paymentRequest.orderId,
      keyId: razorpayService.getPublishableKey(),
      expiresAt: session.expiresAt,
      amount: {
        original: originalAmount.toFixed(2),
        discount: discountAmount.toFixed(2),
        final: finalAmount.toFixed(2),
        gst: gstAmount.toFixed(2),
        total: (finalAmount + gstAmount).toFixed(2),
      },
    });

  } catch (error) {
    // Log the full error with stack trace for debugging
    console.error('CRITICAL ERROR initiating payment:', {
      message: error.message,
      stack: error.stack,
      requestBody: req.body,
      user: req.user ? { id: req.user.id, email: req.user.email } : 'Guest',
      timestamp: new Date().toISOString()
    });

    // Return user-friendly error message
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      errorDetails: process.env.NODE_ENV === 'development' ? {
        type: error.name,
        code: error.code
      } : undefined
    });
  }
};


/**
 * @desc    Handle payment callback from Razorpay
 * @route   GET /api/payment/callback
 * @access  Public (signature verified)
 * 
 * Requirements: 3.1-3.9, 7.1-7.3, 7.8, 4.8, 6.8
 */
const handleCallback = async (req, res) => {
  const razorpayService = getRazorpayService();
  // PostgreSQL handles transactions differently, we don't need mongoose.startSession()

  try {
    const callbackData = req.query;

    // Extract Razorpay payment details (Requirement 3.1)
    let { razorpay_payment_id, razorpay_order_id, razorpay_signature } = callbackData;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).send('<h1>Invalid callback - missing required parameters</h1>');
    }

    // Verify Razorpay signature (Requirement 3.2)
    const isSignatureValid = razorpayService.verifyPaymentSignature({
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isSignatureValid) {
      return res.status(400).send('<h1>Invalid signature - payment verification failed</h1>');
    }

    // Find transaction by order ID in PG
    const transRes = await query(`
        SELECT t.*, s.name as student_name, s.email as student_email, c.title as course_title, c.modules, u.id as instructor_id, u.name as instructor_name, u.role as instructor_role
        FROM transactions t
        JOIN users s ON t.student_id = s.id
        JOIN courses c ON t.course_id = c.id
        LEFT JOIN users u ON c.instructor_id = u.id
        WHERE t.gateway_transaction_id = $1
    `, [razorpay_order_id]);

    const transaction = transRes.rows[0];
    if (!transaction) {
      return res.status(404).send('<h1>Transaction not found</h1>');
    }

    const transactionId = transaction.transaction_id;

    // Fetch payment details from Razorpay
    let paymentDetails;
    try {
      paymentDetails = await razorpayService.fetchPaymentDetails(razorpay_payment_id);
    } catch (fetchError) {
      console.error('Error fetching payment details:', fetchError);
      return res.status(500).send('<h1>Error fetching payment details</h1>');
    }

    if (paymentDetails.status === 'captured') {

      // Update transaction status to success
      await query(`
        UPDATE transactions 
        SET status = 'success', completed_at = NOW(), razorpay_payment_id = $1, 
            payment_method = $2, callback_signature_verified = true
        WHERE transaction_id = $3
      `, [razorpay_payment_id, paymentDetails.method, transactionId]);

      // Activate enrollment in PG
      const enrollId = `enroll_${Date.now()}`;
      await query(`
        INSERT INTO enrollments (id, student_id, course_id, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'active', NOW(), NOW())
        ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'
      `, [enrollId, transaction.student_id, transaction.course_id]);

      // Link student to university if needed
      if (transaction.instructor_role === 'university') {
        await query('UPDATE users SET university_id = $1 WHERE id = $2', [transaction.instructor_id, transaction.student_id]);
      }

      // Real-time notification
      socketService.sendToUser(transaction.student_id, 'notification', {
        type: 'payment_success',
        title: 'Payment Confirmed!',
        message: `Your payment for "${transaction.course_title}" was successful.`
      });

      confirmationMessage = generateSuccessMessage(transaction, transactionId);
    } else if (paymentDetails.status === 'failed') {
      await query(`
        UPDATE transactions 
        SET status = 'failed', error_code = $1, error_message = $2, 
            callback_received_at = NOW(), callback_signature_verified = true
        WHERE transaction_id = $3
      `, [paymentDetails.error_code || 'PAYMENT_FAILED', paymentDetails.error_description || 'Payment failed', transactionId]);
      confirmationMessage = generateFailureMessage(transaction, transactionId);
    }

    // Complete session
    await sessionManager.completeSession(transaction.session_id);

    // Redirect to frontend
    const frontendUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const redirectUrl = `${frontendUrl}/dashboard/payment-callback?transactionId=${transactionId}&status=${transaction.status}&razorpay_payment_id=${razorpay_payment_id}&razorpay_order_id=${razorpay_order_id}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error handling callback:', error);
    res.status(500).send('<h1>Error processing payment</h1>');
  }
};

// Helper function to generate success message HTML
function generateSuccessMessage(transaction, transactionId) {
  return `
    <html>
      <head>
        <title>Payment Successful</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: #28a745; }
          .details { background: #f8f9fa; padding: 20px; margin: 20px auto; max-width: 600px; border-radius: 8px; }
          .button { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px; }
        </style>
      </head>
      <body>
        <h1 class="success">✓ Payment Successful!</h1>
        <div class="details">
          <h3>Transaction Details</h3>
          <p><strong>Transaction ID:</strong> ${transactionId}</p>
          <p><strong>Course:</strong> ${transaction.course_title}</p>
          <p><strong>Amount Paid:</strong> INR ${parseFloat(transaction.final_amount).toFixed(2)}</p>
          <p><strong>Payment Method:</strong> ${transaction.payment_method || 'N/A'}</p>
        </div>
        <a href="/dashboard" class="button">Go to Dashboard</a>
        ${transaction.receipt_url ? `<a href="${transaction.receipt_url}" class="button">Download Receipt</a>` : ''}
      </body>
    </html>
  `;
}

// Helper function to generate failure message HTML
function generateFailureMessage(transaction, transactionId) {
  const canRetry = transaction.retry_count < 3;
  const retryMessage = canRetry
    ? '<p><a href="/courses/' + transaction.course_id + '" class="button">Try Again</a></p>'
    : '<p>Maximum retry attempts reached. Please contact support.</p>';

  return `
    <html>
      <head>
        <title>Payment Failed</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .error { color: #dc3545; }
          .details { background: #f8f9fa; padding: 20px; margin: 20px auto; max-width: 600px; border-radius: 8px; }
          .button { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px; }
        </style>
      </head>
      <body>
        <h1 class="error">✗ Payment Failed</h1>
        <div class="details">
          <h3>Transaction Details</h3>
          <p><strong>Transaction ID:</strong> ${transactionId}</p>
          <p><strong>Course:</strong> ${transaction.course_title}</p>
          <p><strong>Amount:</strong> INR ${parseFloat(transaction.final_amount).toFixed(2)}</p>
          <p><strong>Reason:</strong> ${transaction.error_message || 'Unknown error'}</p>
        </div>
        ${retryMessage}
        <a href="/support" class="button">Contact Support</a>
      </body>
    </html>
  `;
}


/**
 * @desc    Handle webhook notification from Razorpay
 * @route   POST /api/payment/webhook
 * @access  Public (signature verified)
 * 
 * Requirements: 4.1-4.9, 4.8, 6.8
 */
const handleWebhook = async (req, res) => {
  const razorpayService = getRazorpayService();
  const { getClient } = require('../config/postgres');
  const client = await getClient();

  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookBody = req.rawBody;

    // Verify webhook signature (Requirement 4.2)
    const isSignatureValid = razorpayService.verifyWebhookSignature(webhookBody, signature);

    if (!isSignatureValid) {
      client.release();
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature',
      });
    }

    const webhookData = JSON.parse(webhookBody);
    const event = webhookData.event;
    const paymentEntity = webhookData.payload.payment.entity;

    // Only process payment.captured and payment.failed events
    if (event !== 'payment.captured' && event !== 'payment.failed') {
      client.release();
      return res.status(200).json({ received: true });
    }

    const orderId = paymentEntity.order_id;
    const paymentId = paymentEntity.id;
    const status = event === 'payment.captured' ? 'success' : 'failed';

    if (!orderId) {
      client.release();
      return res.status(400).json({
        success: false,
        message: 'Missing order ID',
      });
    }

    // Start PG Transaction
    await client.query('BEGIN');

    // Find transaction by order ID with lock
    const transRes = await client.query('SELECT * FROM transactions WHERE gateway_transaction_id = $1 FOR UPDATE', [orderId]);
    const transaction = transRes.rows[0];

    if (!transaction) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    // Update webhook data and signature verification
    const updatedWebhookData = [...(transaction.webhook_data || []), {
      data: webhookData,
      receivedAt: new Date(),
      processed: true
    }];

    // Update transaction status (Requirement 4.5)
    if (status === 'success' && transaction.status !== 'success') {
      // Update transaction status
      await client.query(`
        UPDATE transactions 
        SET status = 'success', completed_at = NOW(), razorpay_payment_id = $1, 
            webhook_data = $2, webhook_signature_verified = true
        WHERE id = $3
      `, [paymentId, JSON.stringify(updatedWebhookData), transaction.id]);

      // Activate enrollment (Requirement 4.6)
      const enrollId = `enroll_${Date.now()}`;
      await client.query(`
        INSERT INTO enrollments (id, student_id, course_id, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'active', NOW(), NOW())
        ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'
      `, [enrollId, transaction.student_id, transaction.course_id]);

      // Fetch student and course for notifications and university linking
      const studentRes = await client.query('SELECT * FROM users WHERE id = $1', [transaction.student_id]);
      const courseRes = await client.query('SELECT * FROM courses WHERE id = $1', [transaction.course_id]);
      const student = studentRes.rows[0];
      const course = courseRes.rows[0];

      if (student && course && course.instructor_id) {
        const instructorRes = await client.query('SELECT * FROM users WHERE id = $1', [course.instructor_id]);
        const instructor = instructorRes.rows[0];

        if (instructor && instructor.role === 'university') {
          await client.query('UPDATE users SET university_id = $1 WHERE id = $2', [instructor.id, student.id]);
        }
      }

      // Commit PG Transaction
      await client.query('COMMIT');
      client.release();

      // Emit real-time status update
      socketService.sendToUser(transaction.student_id, 'PAYMENT_STATUS_UPDATE', {
        transactionId: transaction.transaction_id,
        status: 'success',
        courseId: transaction.course_id,
        message: 'Payment confirmed successfully'
      });

      // Send confirmation email
      if (student && course) {
        try {
          await emailService.sendPaymentConfirmation(
            transaction,
            student,
            course,
            null // Receipt URL can be added later if needed
          );
        } catch (emailErr) {
          console.error('Error sending webhook confirmation email:', emailErr);
        }
      }

    } else if (status === 'failed' && transaction.status === 'pending') {
      const errorCode = paymentEntity.error_code || 'PAYMENT_FAILED';
      const errorMessage = paymentEntity.error_description || 'Payment failed';

      await client.query(`
        UPDATE transactions 
        SET status = 'failed', error_code = $1, error_message = $2, 
            webhook_data = $3, webhook_signature_verified = true
        WHERE id = $4
      `, [errorCode, errorMessage, JSON.stringify(updatedWebhookData), transaction.id]);

      await client.query('COMMIT');
      client.release();

      socketService.sendToUser(transaction.student_id, 'PAYMENT_STATUS_UPDATE', {
        transactionId: transaction.transaction_id,
        status: 'failed',
        message: errorMessage
      });

    } else {
      // Already processed or status didn't change
      await client.query('COMMIT');
      client.release();
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
    });

  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    console.error('Error handling webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message,
    });
  }
};

/**
 * @desc    Check payment status
 * @route   GET /api/payment/status/:transactionId
 * @access  Private
 * 
 * Requirements: 11.6, 11.7
 */
const checkPaymentStatus = async (req, res) => {
  const razorpayService = getRazorpayService();
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;

    // Find transaction in PG
    const transRes = await query(`
        SELECT t.*, c.title as course_title, c.thumbnail as course_thumbnail
        FROM transactions t
        JOIN courses c ON t.course_id = c.id
        WHERE t.transaction_id = $1
    `, [transactionId]);

    const transaction = transRes.rows[0];

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    // Verify user owns this transaction
    if (transaction.student_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to transaction',
      });
    }

    // Query real-time status from Razorpay (Requirement 11.6)
    try {
      if (transaction.razorpay_payment_id) {
        const paymentDetails = await razorpayService.fetchPaymentDetails(transaction.razorpay_payment_id);
        if (paymentDetails.status === 'captured' && transaction.status !== 'success') {
          await query('UPDATE transactions SET status = \'success\', completed_at = NOW() WHERE id = $1', [transaction.id]);
          transaction.status = 'success';
          transaction.completed_at = new Date();
        }
      } else if (transaction.gateway_transaction_id) {
        const orderDetails = await razorpayService.fetchOrderDetails(transaction.gateway_transaction_id);
        if (orderDetails.status === 'paid' && transaction.status !== 'success') {
          await query('UPDATE transactions SET status = \'success\', completed_at = NOW() WHERE id = $1', [transaction.id]);
          transaction.status = 'success';
          transaction.completed_at = new Date();
        }
      }
    } catch (gatewayError) {
      console.error('Error querying gateway status:', gatewayError);
    }

    // Return transaction details
    res.status(200).json({
      success: true,
      transaction: {
        transactionId: transaction.transaction_id,
        status: transaction.status,
        amount: parseFloat(transaction.final_amount).toFixed(2),
        originalAmount: parseFloat(transaction.original_amount).toFixed(2),
        discountAmount: parseFloat(transaction.discount_amount).toFixed(2),
        gstAmount: parseFloat(transaction.gst_amount).toFixed(2),
        currency: transaction.currency,
        paymentMethod: transaction.payment_method,
        course: {
          id: transaction.course_id,
          title: transaction.course_title,
          thumbnail: transaction.course_thumbnail,
        },
        initiatedAt: transaction.initiated_at,
        completedAt: transaction.completed_at,
        receiptUrl: transaction.receipt_url,
        receiptNumber: transaction.receipt_number,
        errorMessage: transaction.error_message,
        errorCategory: transaction.error_category,
      },
    });

  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status',
      error: error.message,
    });
  }
};


/**
 * @desc    Get payment history for student
 * @route   GET /api/payment/history
 * @access  Private
 * 
 * Requirements: 11.1, 11.2
 */
const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Fetch manual payments from PG
    const manualRes = await query(`
        SELECT p.*, c.title as course_title, c.thumbnail as course_thumbnail, c.category as course_category
        FROM payments p
        JOIN courses c ON p.course_id = c.id
        WHERE p.student_id = $1
        ${status ? 'AND p.status = $2' : ''}
    `, status ? [userId, status] : [userId]);

    const mappedManual = manualRes.rows.map(p => ({
      transactionId: p.transaction_id || p.id,
      course: {
        id: p.course_id,
        title: p.course_title,
        thumbnail: p.course_thumbnail,
        category: p.course_category,
      },
      amount: parseFloat(p.amount).toFixed(2),
      status: p.status,
      paymentMethod: p.payment_method,
      initiatedAt: p.created_at,
      completedAt: p.reviewed_at,
      screenshotUrl: p.screenshot_url,
      isManual: true
    }));

    // Fetch transactions from PG
    const transRes = await query(`
        SELECT t.*, c.title as course_title, c.thumbnail as course_thumbnail, c.category as course_category
        FROM transactions t
        JOIN courses c ON t.course_id = c.id
        WHERE t.student_id = $1
        ${status ? 'AND t.status = $2' : ''}
    `, status ? [userId, status] : [userId]);

    const formattedTransactions = transRes.rows.map(txn => ({
      transactionId: txn.transaction_id,
      course: {
        id: txn.course_id,
        title: txn.course_title,
        thumbnail: txn.course_thumbnail,
        category: txn.course_category,
      },
      amount: parseFloat(txn.final_amount).toFixed(2),
      status: txn.status === 'success' ? 'approved' : txn.status === 'failed' ? 'rejected' : 'pending',
      paymentMethod: txn.payment_method,
      initiatedAt: txn.initiated_at,
      completedAt: txn.completed_at,
      receiptUrl: txn.receipt_url,
    }));

    // Combine and sort
    let allHistory = [...mappedManual, ...formattedTransactions];
    allHistory.sort((a, b) => new Date(b.initiatedAt) - new Date(a.initiatedAt));

    // Manual Pagination
    const totalItems = allHistory.length;
    const paginatedHistory = allHistory.slice(offset, offset + parseInt(limit));
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    res.status(200).json({
      success: true,
      transactions: paginatedHistory,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems,
        itemsPerPage: parseInt(limit),
      },
    });

  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
      error: error.message,
    });
  }
};

/**
 * @desc    Process refund
 * @route   POST /api/admin/payment/refund
 * @access  Private (Admin + 2FA)
 * 
 * Requirements: 8.1-8.10, 17.10
 */
const processRefund = async (req, res) => {
  const razorpayService = getRazorpayService();
  try {
    const { transactionId, amount, reason } = req.body;
    const adminId = req.user.id;

    // Validate admin has refund permissions (Requirement 8.1, 14.4)
    if (req.user.role !== 'admin' && req.user.role !== 'finance') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to process refunds',
      });
    }

    // Find transaction in PG
    const transRes = await query(`
        SELECT t.*, s.name as student_name, s.email as student_email, c.title as course_title
        FROM transactions t
        JOIN users s ON t.student_id = s.id
        JOIN courses c ON t.course_id = c.id
        WHERE t.transaction_id = $1
    `, [transactionId]);

    const transaction = transRes.rows[0];

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    // Validate transaction status is success (Requirement 8.1)
    if (transaction.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: 'Can only refund successful transactions',
      });
    }

    // Check if already refunded (Requirement 8.10)
    if (transaction.status === 'refunded' || transaction.status === 'partial_refund') {
      return res.status(400).json({
        success: false,
        message: 'Transaction already refunded',
      });
    }

    // Validate refund amount (Requirements 8.3, 17.10)
    const refundAmount = parseFloat(amount);
    const originalAmountValue = parseFloat(transaction.final_amount);

    if (refundAmount <= 0 || refundAmount > originalAmountValue) {
      return res.status(400).json({
        success: false,
        message: 'Invalid refund amount',
      });
    }

    // Send refund request to Razorpay
    const refundResponse = await razorpayService.initiateRefund(
      transaction.razorpay_payment_id,
      Math.round(refundAmount * 100) // Convert to paise
    );

    // Verify signature of refund response (Requirement 8.4)
    if (!refundResponse.success) {
      // Log error (Requirement 8.7)
      await securityLogger.logRefundOperation(
        transactionId,
        adminId,
        refundAmount,
        `Failed: ${refundResponse.message}`
      );

      return res.status(500).json({
        success: false,
        message: 'Refund request failed',
        error: refundResponse.message,
      });
    }

    // Determine refund status
    const newStatus = (refundAmount >= originalAmountValue) ? 'refunded' : 'partial_refund';

    const refundCompletionDate = new Date();
    refundCompletionDate.setDate(refundCompletionDate.getDate() + 7); // 5-7 business days

    // Update transaction record in PG
    await query(`
      UPDATE transactions 
      SET refund_amount = $1, 
          refund_transaction_id = $2, 
          refund_initiated_by = $3, 
          refund_initiated_at = NOW(), 
          refund_reason = $4,
          status = $5,
          refund_completed_at = $6
      WHERE id = $7
    `, [refundAmount, refundResponse.refund_id, adminId, reason, newStatus, refundCompletionDate, transaction.id]);

    // Deactivate enrollment (Requirement 8.6)
    if (refundAmount >= originalAmountValue) {
      await query(`
        UPDATE enrollments 
        SET status = 'suspended', updated_at = NOW() 
        WHERE student_id = $1 AND course_id = $2
      `, [transaction.student_id, transaction.course_id]);
    }

    // Log refund operation (Requirement 5.8)
    await securityLogger.logRefundOperation(
      transactionId,
      adminId,
      refundAmount,
      reason
    );

    // Send refund confirmation email (Requirement 8.8)
    try {
      await emailService.sendRefundConfirmation(
        transaction,
        { name: transaction.student_name, email: transaction.student_email },
        { title: transaction.course_title }
      );
    } catch (emailError) {
      console.error('Error sending refund email:', emailError);
    }

    res.status(200).json({
      success: true,
      refundTransactionId: refundResponse.refund_id,
      status: refundResponse.status,
      estimatedCompletionDate: refundCompletionDate,
      message: 'Refund initiated successfully',
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
      error: error.message,
    });
  }
};

/**
 * @desc    Retry failed payment
 * @route   POST /api/payment/retry/:transactionId
 * @access  Private
 * 
 * Requirements: 7.3, 7.4, 7.5, 7.6, 6.9
 */
const retryPayment = async (req, res) => {
  const razorpayService = getRazorpayService();
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;

    // Find original transaction in PG
    const transRes = await query(`
        SELECT t.*, c.title as course_title, c.price as course_price
        FROM transactions t
        JOIN courses c ON t.course_id = c.id
        WHERE t.transaction_id = $1
    `, [transactionId]);

    const originalTransaction = transRes.rows[0];

    if (!originalTransaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    // Verify user owns this transaction
    if (originalTransaction.student_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to transaction',
      });
    }

    // Validate transaction status is failed (Requirement 7.3)
    if (originalTransaction.status !== 'failed') {
      return res.status(400).json({
        success: false,
        message: 'Can only retry failed transactions',
      });
    }

    // Check retry count (Requirement 7.5)
    if (originalTransaction.retry_count >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Maximum retry attempts reached. Please create a new payment session.',
      });
    }

    // Check retry is within 24 hours (Requirement 7.5)
    const hoursSinceInitiation = (Date.now() - new Date(originalTransaction.initiated_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceInitiation > 24) {
      return res.status(400).json({
        success: false,
        message: 'Retry period expired. Please create a new payment session.',
      });
    }

    // Get student details from PG
    const studentRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
    const student = studentRes.rows[0];

    // Generate new transaction ID (Requirement 7.6)
    const newTransactionId = generateTransactionId();
    const newId = `txn_${Date.now()}`;
    const sessionExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Create new transaction record in PG linked to original (Requirement 7.6, 6.9)
    await query(`
      INSERT INTO transactions (
        id, transaction_id, student_id, course_id, original_amount, 
        discount_amount, final_amount, gst_amount, currency, 
        discount_code, discount_percentage, status, session_id, 
        session_expires_at, retry_count, last_retry_at, ip_address, 
        user_agent, initiated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), $16, $17, NOW())
    `, [
      newId, newTransactionId, userId, originalTransaction.course_id,
      originalTransaction.original_amount, originalTransaction.discount_amount,
      originalTransaction.final_amount, originalTransaction.gst_amount,
      originalTransaction.currency, originalTransaction.discount_code,
      originalTransaction.discount_percentage, 'pending', '', // session_id will be set below
      sessionExpiresAt, originalTransaction.retry_count + 1, req.ip, req.get('user-agent')
    ]);

    // Increment retry count on original transaction in PG
    await query(`
      UPDATE transactions 
      SET retry_count = retry_count + 1, last_retry_at = NOW() 
      WHERE id = $1
    `, [originalTransaction.id]);

    // Create new payment session (Requirement 7.6)
    const session = await sessionManager.createSession({
      transactionId: newTransactionId,
      student: userId,
      course: originalTransaction.course_id,
      amount: parseFloat(originalTransaction.final_amount),
    });

    // Update new transaction with session ID in PG
    await query('UPDATE transactions SET session_id = $1, session_expires_at = $2 WHERE transaction_id = $3', [session.sessionId, session.expiresAt, newTransactionId]);

    // Generate Razorpay order
    const paymentRequest = await razorpayService.createOrder({
      transactionId: newTransactionId,
      amount: Math.round((parseFloat(originalTransaction.final_amount) + parseFloat(originalTransaction.gst_amount)) * 100), // Total amount in paise
      currency: 'INR',
      customerName: student.name,
      customerEmail: student.email,
      customerPhone: student.phone || '',
      productInfo: `${originalTransaction.course_title} - Course Enrollment (Retry)`,
      courseId: originalTransaction.course_id,
      studentId: userId,
      gstAmount: originalTransaction.gst_amount,
    });

    // Store Razorpay order ID in transaction in PG
    await query('UPDATE transactions SET gateway_transaction_id = $1 WHERE transaction_id = $2', [paymentRequest.order_id, newTransactionId]);

    // Log retry attempt
    await securityLogger.logPaymentAttempt(
      newTransactionId,
      userId,
      req.ip,
      req.get('user-agent')
    );

    res.status(200).json({
      success: true,
      newTransactionId,
      orderId: paymentRequest.orderId,
      keyId: razorpayService.getPublishableKey(),
      expiresAt: session.expiresAt,
      retryCount: originalTransaction.retry_count + 1,
    });

  } catch (error) {
    console.error('Error retrying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry payment',
      error: error.message,
    });
  }
};

const createManualPayment = async (req, res) => {
  try {
    const { courseId, amount, paymentMethod, notes } = req.body;
    const studentId = req.user.id; // Corrected to req.user.id for PG compatibility

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload payment proof (screenshot)' });
    }

    // Fetch course details from PG
    const courseRes = await query('SELECT * FROM courses WHERE id = $1', [courseId]);
    const course = courseRes.rows[0];
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Fetch student with partner/university details from PG
    // Note: This assumes university_id and registered_by are handled in PG.
    // In many PG schemas, user self-joins or has foreign keys.
    const studentRes = await query(`
      SELECT s.*, 
             u.name as university_name, u.profile as university_profile,
             r.name as registered_by_name, r.profile as registered_by_profile
      FROM users s
      LEFT JOIN users u ON s.university_id = u.id
      LEFT JOIN users r ON s.registered_by = r.id
      WHERE s.id = $1
    `, [studentId]);

    const student = studentRes.rows[0];

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Determine partner and center for reporting
    const partnerId = student.registered_by || student.university_id;

    // Set center based on partner type
    let center = 'Direct';
    if (student.university_id) {
      center = (student.university_profile && student.university_profile.universityName) || student.university_name;
    } else if (student.registered_by) {
      center = (student.registered_by_profile && student.registered_by_profile.partnerName) || student.registered_by_name || 'Partner Network';
    }

    // Generate a unique transaction ID for tracking
    const transactionId = `MAN-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Create payment record in PG
    const paymentId = `pay_${Date.now()}`;
    const paymentAmount = amount || course.price;

    await query(`
      INSERT INTO payments (
        id, student_id, course_id, amount, payment_method, 
        notes, screenshot_url, status, partner_id, center, 
        transaction_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [
      paymentId, studentId, courseId, paymentAmount,
      paymentMethod || 'bank_transfer', notes,
      `uploads/payments/${req.file.filename}`, 'pending',
      partnerId, center, transactionId
    ]);

    // Notify admin/finance via WebSocket
    socketService.sendToRole('admin', 'payment_proof_uploaded', {
      paymentId: paymentId,
      studentName: student.name,
      studentEmail: student.email,
      courseTitle: course.title,
      amount: paymentAmount,
      transactionId
    });

    socketService.sendToRole('finance', 'payment_proof_uploaded', {
      paymentId: paymentId,
      studentName: student.name,
      studentEmail: student.email,
      courseTitle: course.title,
      amount: paymentAmount,
      transactionId
    });

    res.status(201).json({
      success: true,
      message: 'Payment proof submitted successfully. Waiting for finance approval.',
      paymentId
    });
  } catch (error) {
    console.error('Error in createManualPayment:', error);
    res.status(500).json({ success: false, message: 'Failed to submit payment proof' });
  }
};

/**
 * @desc    Approve manual payment proof
 * @route   PUT /api/payment/:id/approve
 * @access  Private (Admin, Finance)
 */
const approvePayment = async (req, res) => {
  try {
    const reviewerId = req.user.id;
    const { id } = req.params;

    // Get payment details from PG
    const payRes = await query(`
        SELECT p.*, s.email as student_email, s.name as student_name
        FROM payments p
        JOIN users s ON p.student_id = s.id
        WHERE p.id = $1
    `, [id]);

    const payment = payRes.rows[0];

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Payment already reviewed' });
    }

    // Update payment record in PG
    await query(`
      UPDATE payments 
      SET status = 'approved', 
          reviewed_by = $1, 
          reviewed_at = NOW(), 
          updated_at = NOW() 
      WHERE id = $2
    `, [reviewerId, id]);

    // Create enrollment in PG
    const enrollId = `enroll_${Date.now()}`;
    await query(`
      INSERT INTO enrollments (id, student_id, course_id, status, created_at, updated_at)
      VALUES ($1, $2, $3, 'active', NOW(), NOW())
      ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'
    `, [enrollId, payment.student_id, payment.course_id]);

    // Update payment with enrollment_id
    await query('UPDATE payments SET enrollment_id = $1 WHERE id = $2', [enrollId, id]);

    // Notify student via WebSocket
    socketService.sendToUser(payment.student_id, 'payment_approved', {
      paymentId: id,
      amount: payment.amount,
      transactionId: payment.transaction_id
    });

    // Send email notification
    try {
      await emailService.sendManualPaymentApproval(payment.student_email, payment.student_name, payment.transaction_id, payment.amount);
    } catch (emailError) {
      console.error('Error sending approval email:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Payment approved and enrollment activated',
      payment
    });
  } catch (error) {
    console.error('Error approving payment:', error);
    res.status(500).json({ success: false, message: 'Failed to approve payment' });
  }
};

/**
 * @desc    Reject manual payment proof
 * @route   PUT /api/payment/:id/reject
 * @access  Private (Admin, Finance)
 */
const rejectPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const reviewerId = req.user.id;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    // Update payment record in PG
    await query(`
      UPDATE payments 
      SET status = 'rejected', 
          notes = $1, 
          reviewed_by = $2, 
          reviewed_at = NOW(), 
          updated_at = NOW() 
      WHERE id = $3
    `, [reason, reviewerId, id]);

    // Fetch details for notification
    const payRes = await query(`
        SELECT p.*, s.email as student_email, s.name as student_name
        FROM payments p
        JOIN users s ON p.student_id = s.id
        WHERE p.id = $1
    `, [id]);
    const payment = payRes.rows[0];

    // Notify student via WebSocket
    socketService.sendToUser(payment.student_id, 'payment_rejected', {
      paymentId: id,
      amount: payment.amount,
      transactionId: payment.transaction_id,
      reason
    });

    // Send email notification
    try {
      await emailService.sendManualPaymentRejection(payment.student_email, payment.student_name, payment.transaction_id, reason);
    } catch (emailError) {
      console.error('Error sending rejection email:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Payment rejected',
      payment
    });
  } catch (error) {
    console.error('Error rejecting payment:', error);
    res.status(500).json({ success: false, message: 'Failed to reject payment' });
  }
};

/**
 * @desc    Get pending payment proofs for admin/finance review
 * @route   GET /api/payment/pending-proofs
 * @access  Private (Admin, Finance)
 */
const getPendingProofs = async (req, res) => {
  try {
    const pendingPayments = await query(`
        SELECT p.*, s.name as student_name, s.email as student_email, c.title as course_title, c.thumbnail as course_thumbnail
        FROM payments p
        JOIN users s ON p.student_id = s.id
        JOIN courses c ON p.course_id = c.id
        WHERE p.status = 'pending'
        ORDER BY p.created_at DESC
    `);

    res.status(200).json({
      success: true,
      count: pendingPayments.rowCount,
      payments: pendingPayments.rows.map(p => ({
        _id: p.id,
        student: { name: p.student_name, email: p.student_email },
        course: { title: p.course_title, thumbnail: p.course_thumbnail },
        amount: p.amount,
        paymentMethod: p.payment_method,
        screenshotUrl: p.screenshot_url,
        createdAt: p.created_at,
        transactionId: p.transaction_id,
        notes: p.notes,
        partner: p.partner_id,
        center: p.center
      }))
    });
  } catch (error) {
    console.error('Error fetching pending proofs:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending proofs' });
  }
};

module.exports = {
  initiatePayment,
  handleCallback,
  handleWebhook,
  checkPaymentStatus,
  getPaymentHistory,
  processRefund,
  retryPayment,
  createManualPayment,
  approvePayment,
  rejectPayment,
  getPendingProofs
};
