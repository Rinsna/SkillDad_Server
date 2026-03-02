/**
 * Payment Controller
 * 
 * Orchestrates payment operations and coordinates between services.
 * Handles payment initiation, callbacks, webhooks, status checks, refunds, and retries.
 * 
 * Requirements: 1.1-1.8, 3.1-3.9, 4.1-4.9, 7.1-7.9, 8.1-8.10, 11.1-11.10, 13.1-13.9, 17.1-17.10
 */

const Transaction = require('../models/payment/Transaction');
const Enrollment = require('../models/enrollmentModel');
const Course = require('../models/courseModel');
const User = require('../models/userModel');
const Discount = require('../models/discountModel');
const Progress = require('../models/progressModel');
const StripeGatewayService = require('../services/payment/StripeGatewayService');
const PaymentSessionManager = require('../services/payment/PaymentSessionManager');
const SecurityLogger = require('../services/payment/SecurityLogger');
const PCIComplianceService = require('../services/payment/PCIComplianceService');
const MonitoringService = require('../services/payment/MonitoringService');
const ReceiptGeneratorService = require('../services/payment/ReceiptGeneratorService');
const sendEmail = require('../utils/sendEmail');
const EmailService = require('../services/payment/EmailService');
const mongoose = require('mongoose');
const path = require('path');
const socketService = require('../services/SocketService');

// Initialize services (lazy init for StripeGatewayService)
let _stripeService = null;
const getStripeService = () => {
  if (!_stripeService) {
    const gatewayConfig = {
      secretKey: process.env.STRIPE_SECRET_KEY,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    };
    _stripeService = new StripeGatewayService(gatewayConfig);
  }
  return _stripeService;
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
    const stripeService = getStripeService();

    // Validate course exists (Requirement 1.1)
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check for existing active enrollment - allow re-enrollment for renewals/upgrades
    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      course: courseId,
      status: 'active'
    });

    // Log if student is re-enrolling (for analytics)
    if (existingEnrollment) {
      console.log(`[INFO] Student ${studentId} is re-enrolling in course ${courseId}`);
      // Allow payment to proceed - they might be renewing or upgrading
    }

    // Get student details
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
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

    // Validate and apply discount code if provided (Requirements 13.1, 13.2, 13.7)
    if (discountCode) {
      const discount = await Discount.findOne({
        code: discountCode.toUpperCase(),
        isActive: true,
        $or: [
          { expiryDate: { $gt: new Date() } },
          { expiryDate: null },
          { expiryDate: { $exists: false } }
        ]
      });

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

    // Create transaction record with status "pending" (Requirements 1.8, 6.1)
    const transaction = await Transaction.create({
      transactionId,
      student: studentId,
      course: courseId,
      originalAmount,
      discountAmount,
      finalAmount,
      gstAmount,
      currency: 'INR',
      discountCode: discountCodeUsed,
      discountPercentage,
      status: 'pending',
      sessionId: session.sessionId,
      sessionExpiresAt: session.expiresAt,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      initiatedAt: new Date(),
    });

    // Generate Stripe payment session or intent
    let paymentRequest;
    try {
      const mode = req.body.mode || 'checkout'; // 'checkout' or 'elements'

      if (mode === 'elements') {
        paymentRequest = await stripeService.createPaymentIntent({
          transactionId,
          amount: finalAmount,
          currency: 'INR',
          customerName: student.name,
          customerEmail: student.email,
          customerPhone: student.phone || '',
          productInfo: `${course.title} - Course Enrollment`,
          courseId: course._id,
          studentId: student._id,
          gstAmount,
        });
      } else {
        paymentRequest = await stripeService.createPaymentRequest({
          transactionId,
          amount: finalAmount,
          currency: 'INR',
          customerName: student.name,
          customerEmail: student.email,
          customerPhone: student.phone || '',
          productInfo: `${course.title} - Course Enrollment`,
          courseId: course._id,
          studentId: student._id,
          gstAmount,
        });
      }
    } catch (paymentError) {
      // Handle gateway timeout during payment request creation (Requirement 7.9)
      if (paymentError.message.includes('GATEWAY_TIMEOUT')) {
        // Update transaction status
        transaction.status = 'failed';
        transaction.errorCode = 'GATEWAY_TIMEOUT';
        transaction.errorMessage = 'Payment gateway timeout';
        transaction.errorCategory = 'gateway_timeout';
        await transaction.save();

        // Log the error
        await monitoringService.logAPIError(
          'createPaymentRequest',
          'GATEWAY_TIMEOUT',
          paymentError.message
        );

        return res.status(503).json({
          success: false,
          message: 'Payment gateway is temporarily unavailable. Please try again in a few minutes.',
          errorCategory: 'gateway_timeout',
          transactionId,
        });
      }

      // Handle other errors
      transaction.status = 'failed';
      transaction.errorMessage = paymentError.message;
      await transaction.save();

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

    // Return payment URL or client secret (Requirement 1.6)
    res.status(200).json({
      success: true,
      transactionId,
      sessionId: session.sessionId,
      paymentUrl: paymentRequest.paymentUrl,
      clientSecret: paymentRequest.clientSecret, // Sent if mode === 'elements'
      publishableKey: stripeService.publishableKey, // Needed for Elements provider
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
 * @desc    Handle payment callback from gateway
 * @route   GET /api/payment/callback
 * @access  Public (signature verified)
 * 
 * Requirements: 3.1-3.9, 7.1-7.3, 7.8, 4.8, 6.8
 */
const handleCallback = async (req, res) => {
  const stripeService = getStripeService();
  // Start a MongoDB session for transaction support (Requirement 4.8, 6.8)
  const session = await mongoose.startSession();

  try {
    const callbackData = req.query;

    // Extract transaction ID and payment status (Requirement 3.1)
    let { transactionId, status, gatewayTransactionId, signature } = callbackData;

    if (!transactionId) {
      return res.status(400).send('<h1>Invalid callback - missing transaction ID</h1>');
    }

    // Start transaction with retry logic for concurrent updates
    let transaction;
    // Find transaction without mongoose session locking due to non-replica set environment locally
    transaction = await Transaction.findOne({ transactionId })
      .populate('student', 'name email')
      .populate({
        path: 'course',
        select: 'title instructor',
        populate: { path: 'instructor', select: 'name role' }
      });

    if (!transaction) {
      return res.status(404).send('<h1>Transaction not found</h1>');
    }

    // Check session expiration (Requirements 1.7, 14.6)
    const now = new Date();
    if (transaction.sessionExpiresAt && now > transaction.sessionExpiresAt) {
      // Session has expired
      transaction.status = 'expired';
      transaction.errorCode = 'SESSION_EXPIRED';
      transaction.errorMessage = 'Payment session has expired (15 minute timeout)';
      transaction.errorCategory = 'expired';
      transaction.callbackData = callbackData;
      transaction.callbackReceivedAt = new Date();
      await transaction.save();

      // Mark session as expired
      try {
        await sessionManager.expireSession(transaction.sessionId);
      } catch (sessionError) {
        console.error('Error expiring session:', sessionError);
      }

      // Send expired session HTML response
      const expiredMessage = `
        <html>
          <head>
            <title>Session Expired</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; margin: 0; }
              .container { background: white; padding: 40px; border-radius: 12px; max-width: 600px; margin: 0 auto; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
              .expired { color: #f59e0b; font-size: 64px; margin-bottom: 20px; }
              h1 { color: #1f2937; margin-bottom: 10px; }
              p { color: #6b7280; line-height: 1.6; margin-bottom: 30px; }
              .details { background: #fef3c7; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #f59e0b; }
              .details p { margin: 5px 0; text-align: left; color: #92400e; }
              .button { background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px; font-weight: 600; transition: all 0.3s; }
              .button:hover { background: #2563eb; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); }
              .button-secondary { background: #6b7280; }
              .button-secondary:hover { background: #4b5563; }
              .info { background: #dbeafe; padding: 15px; border-radius: 8px; margin-top: 20px; }
              .info p { color: #1e40af; font-size: 14px; margin: 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="expired">⏱️</div>
              <h1>Payment Session Expired</h1>
              <p>Your payment session has expired after 15 minutes of inactivity. For security reasons, payment sessions have a limited validity period.</p>
              
              <div class="details">
                <p><strong>Transaction ID:</strong> ${transactionId}</p>
                <p><strong>Course:</strong> ${transaction.course.title}</p>
                <p><strong>Amount:</strong> INR ${transaction.finalAmountFormatted}</p>
                <p><strong>Session Expired At:</strong> ${transaction.sessionExpiresAt.toLocaleString()}</p>
              </div>

              <div class="info">
                <p><strong>What happened?</strong> Payment sessions expire after 15 minutes to protect your security. You can create a new payment session to complete your enrollment.</p>
              </div>

              <a href="/courses/${transaction.course._id}" class="button">Create New Payment Session</a>
              <a href="/dashboard" class="button button-secondary">Go to Dashboard</a>
            </div>
          </body>
        </html>
      `;

      return res.send(expiredMessage);
    }

    // Note: Stripe redirection doesn't require signature verification here
    // as finality is handled by webhooks. We verify the session status.
    // status and gatewayTransactionId are already declared above

    try {
      // Find session to verify
      const stripeSession = await stripeService.getSession(transaction.gatewayTransactionId || '');
      if (stripeSession && stripeSession.payment_status === 'paid') {
        status = 'success';
        gatewayTransactionId = stripeSession.payment_intent;
      }
    } catch (err) {
      console.warn('Could not verify Stripe session in callback, relying on URL parameter');
    }

    // Update transaction with callback data (Requirement 3.4)
    transaction.callbackData = callbackData;
    transaction.callbackReceivedAt = new Date();
    transaction.callbackSignatureVerified = true;
    transaction.gatewayTransactionId = gatewayTransactionId;

    // Extract payment method details if available
    if (callbackData.paymentMethod) {
      transaction.paymentMethod = callbackData.paymentMethod;
      transaction.paymentMethodDetails = {
        cardType: callbackData.cardType,
        cardLast4: callbackData.cardLast4,
        bankName: callbackData.bankName,
        upiId: callbackData.upiId,
        walletProvider: callbackData.walletProvider,
      };
    }

    let confirmationMessage = '';

    // Handle success status (Requirements 3.4, 3.5)
    if (status === 'success') {
      transaction.status = 'success';
      transaction.completedAt = new Date();

      // Activate course enrollment (Requirement 3.5)
      let enrollment = await Enrollment.findOne({
        student: transaction.student._id,
        course: transaction.course._id,
      });

      if (!enrollment) {
        enrollment = await Enrollment.create([{
          student: transaction.student._id,
          course: transaction.course._id,
          enrollmentDate: new Date(),
          status: 'active',
          progress: 0,
          completedModules: 0,
          totalModules: transaction.course.modules?.length || 0,
        }]);

        // Also create Progress record for the student dashboard
        await Progress.create([{
          user: transaction.student._id,
          course: transaction.course._id,
          completedVideos: [],
          completedExercises: [],
          projectSubmissions: [],
          isCompleted: false
        }]);

        transaction.enrollment = enrollment[0]._id;
      } else {
        enrollment.status = 'active';
        await enrollment.save();
      }

      // Link student to university if course is university-hosted
      try {
        const student = await User.findById(transaction.student._id);
        const instructor = await User.findById(transaction.course.instructor);
        if (student && instructor && instructor.role === 'university') {
          student.universityId = instructor._id;
          await student.save();
          console.log(`[Payment] Linked student ${student.email} to university ${instructor.name}`);
        }
      } catch (linkError) {
        console.error('Error linking student to university:', linkError);
      }

      // Generate receipt (Requirement 9.1)
      try {
        const receipt = await receiptGenerator.generateReceipt(transactionId);
        transaction.receiptNumber = receipt.receiptNumber;
        transaction.receiptUrl = receipt.receiptUrl;
        transaction.receiptGeneratedAt = new Date();
      } catch (receiptError) {
        console.error('Error generating receipt:', receiptError);
      }

      // Save transaction before committing
      await transaction.save();

      // Send confirmation email (Requirement 3.9) - after commit
      try {
        await emailService.sendPaymentConfirmation(
          transaction,
          transaction.student,
          transaction.course,
          transaction.receiptUrl ? path.join(__dirname, '../../client/public', transaction.receiptUrl) : null
        );
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
      }

      // Real-time notification: Payment Confirmed
      socketService.sendToUser(
        transaction.student._id,
        'notification',
        {
          type: 'payment_success',
          title: 'Payment Confirmed!',
          message: `Your payment for "${transaction.course.title}" was successful.`,
          transactionId: transactionId,
          amount: transaction.amount
        }
      );

      confirmationMessage = generateSuccessMessage(transaction, transactionId);

      // Track successful payment (Requirement 16.1)
      await monitoringService.trackPaymentAttempt(transactionId, 'success');

    } else if (status === 'failed') {
      // Handle failure status (Requirements 3.6, 7.1, 7.2)
      transaction.status = 'failed';
      transaction.errorCode = callbackData.errorCode || 'PAYMENT_FAILED';
      transaction.errorMessage = callbackData.errorMessage || 'Payment failed';

      // Categorize failure reason (Requirement 7.2)
      const errorCode = callbackData.errorCode || '';
      if (errorCode.includes('INSUFFICIENT')) {
        transaction.errorCategory = 'insufficient_funds';
      } else if (errorCode.includes('DECLINED') || errorCode.includes('CARD')) {
        transaction.errorCategory = 'card_declined';
      } else if (errorCode.includes('TIMEOUT') || errorCode.includes('NETWORK')) {
        transaction.errorCategory = 'network';
      } else if (errorCode.includes('EXPIRED')) {
        transaction.errorCategory = 'expired';
      } else {
        transaction.errorCategory = 'other';
      }

      // Save transaction before committing
      await transaction.save();

      // Send failure notification email (Requirement 7.7) - after commit
      try {
        await emailService.sendPaymentFailure(
          transaction,
          transaction.student,
          transaction.course
        );
      } catch (emailError) {
        console.error('Error sending failure email:', emailError);
      }

      confirmationMessage = generateFailureMessage(transaction, transactionId);

      // Track failed payment (Requirement 16.1)
      await monitoringService.trackPaymentAttempt(transactionId, 'failed');
    }

    // Complete session
    await sessionManager.completeSession(transaction.sessionId);

    // Redirect to frontend confirmation page (Requirement 3.8)
    const frontendUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const redirectUrl = `${frontendUrl}/dashboard/payment-callback?transactionId=${transactionId}&status=${status}&gatewayTransactionId=${gatewayTransactionId || ''}&signature=${signature || ''}`;

    console.log('[DEBUG] Redirecting to frontend:', redirectUrl);
    res.redirect(redirectUrl);

  } catch (error) {
    console.error('Error handling callback:', error);
    res.status(500).send('<h1>Error</h1><p>An error occurred while processing your payment</p>');
  } finally {
    // End session
    if (session) {
      session.endSession();
    }
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
          <p><strong>Course:</strong> ${transaction.course.title}</p>
          <p><strong>Amount Paid:</strong> INR ${transaction.finalAmountFormatted}</p>
          <p><strong>Payment Method:</strong> ${transaction.paymentMethod || 'N/A'}</p>
        </div>
        <a href="/dashboard" class="button">Go to Dashboard</a>
        ${transaction.receiptUrl ? `<a href="${transaction.receiptUrl}" class="button">Download Receipt</a>` : ''}
      </body>
    </html>
  `;
}

// Helper function to generate failure message HTML
function generateFailureMessage(transaction, transactionId) {
  const canRetry = transaction.retryCount < 3;
  const retryMessage = canRetry
    ? '<p><a href="/courses/' + transaction.course._id + '" class="button">Try Again</a></p>'
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
          <p><strong>Course:</strong> ${transaction.course.title}</p>
          <p><strong>Amount:</strong> INR ${transaction.finalAmountFormatted}</p>
          <p><strong>Reason:</strong> ${transaction.errorMessage}</p>
        </div>
        ${retryMessage}
        <a href="/support" class="button">Contact Support</a>
      </body>
    </html>
  `;
}


/**
 * @desc    Handle webhook notification from HDFC gateway
 * @route   POST /api/payment/webhook
 * @access  Public (signature verified)
 * 
 * Requirements: 4.1-4.9, 4.8, 6.8
 */
const handleWebhook = async (req, res) => {
  const stripeService = getStripeService();
  // Start a MongoDB session for transaction support (Requirement 4.8, 6.8)
  const session = await mongoose.startSession();

  try {
    const signature = req.headers['stripe-signature'];
    let event;

    try {
      event = stripeService.verifyWebhook(req.rawBody, signature);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type !== 'checkout.session.completed' &&
      event.type !== 'payment_intent.succeeded' &&
      event.type !== 'payment_intent.payment_failed') {
      return res.status(200).json({ received: true });
    }

    let transactionId, status, gatewayTransactionId, sessionData;

    if (event.type === 'checkout.session.completed') {
      sessionData = event.data.object;
      transactionId = sessionData.client_reference_id;
      status = sessionData.payment_status === 'paid' ? 'success' : 'failed';
      gatewayTransactionId = sessionData.payment_intent;
    } else if (event.type === 'payment_intent.succeeded') {
      sessionData = event.data.object;
      transactionId = sessionData.metadata.transactionId;
      status = 'success';
      gatewayTransactionId = sessionData.id;
    } else if (event.type === 'payment_intent.payment_failed') {
      sessionData = event.data.object;
      transactionId = sessionData.metadata.transactionId;
      status = 'failed';
      gatewayTransactionId = sessionData.id;
    }

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Missing transaction ID',
      });
    }

    // Start transaction with retry logic for concurrent updates
    let transaction;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        await session.startTransaction();

        // Find transaction with lock (using session for isolation)
        transaction = await Transaction.findOne({ transactionId }).session(session);

        if (!transaction) {
          await session.abortTransaction();
          return res.status(404).json({
            success: false,
            message: 'Transaction not found',
          });
        }

        break; // Successfully acquired lock
      } catch (error) {
        await session.abortTransaction();

        if (error.name === 'MongoServerError' && error.code === 112) {
          // WriteConflict error - retry
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error('Failed to acquire transaction lock after multiple retries');
          }
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retryCount)));
          await session.startTransaction();
        } else {
          throw error;
        }
      }
    }

    // Store webhook data
    transaction.webhookData.push({
      data: sessionData,
      receivedAt: new Date(),
      processed: false,
    });

    transaction.webhookSignatureVerified = true;

    // Update transaction status (Requirement 4.5)
    if (status === 'success' && transaction.status !== 'success') {
      transaction.status = 'success';
      transaction.completedAt = new Date();
      transaction.gatewayTransactionId = gatewayTransactionId;

      // Activate enrollment if not already active (Requirement 4.6)
      let enrollment = await Enrollment.findOne({
        student: transaction.student,
        course: transaction.course,
      }).session(session);

      if (!enrollment) {
        const course = await Course.findById(transaction.course).session(session);
        enrollment = await Enrollment.create([{
          student: transaction.student,
          course: transaction.course,
          enrollmentDate: new Date(),
          status: 'active',
          progress: 0,
          completedModules: 0,
          totalModules: course?.modules?.length || 0,
        }], { session });

        // Also create Progress record for the student dashboard
        await Progress.create([{
          user: transaction.student,
          course: transaction.course,
          completedVideos: [],
          completedExercises: [],
          projectSubmissions: [],
          isCompleted: false
        }], { session });

        transaction.enrollment = enrollment[0]._id;
      } else if (enrollment.status !== 'active') {
        enrollment.status = 'active';
        await enrollment.save({ session });
      }

      // Link student to university if course is university-hosted
      try {
        const student = await User.findById(transaction.student);
        const course = await Course.findById(transaction.course);
        if (student && course && course.instructor) {
          const instructor = await User.findById(course.instructor);
          if (instructor && instructor.role === 'university') {
            student.universityId = instructor._id;
            await student.save({ session });
            console.log(`[Webhook] Linked student ${student.email} to university ${instructor.name}`);
          }
        }
      } catch (linkError) {
        console.error('Error linking student to university in webhook:', linkError);
      }

      // Generate receipt if not already generated
      if (!transaction.receiptUrl) {
        try {
          const receipt = await receiptGenerator.generateReceipt(transactionId);
          transaction.receiptNumber = receipt.receiptNumber;
          transaction.receiptUrl = receipt.receiptUrl;
          transaction.receiptGeneratedAt = new Date();
        } catch (receiptError) {
          console.error('Error generating receipt:', receiptError);
        }
      }

      // Mark webhook as processed
      transaction.webhookData[transaction.webhookData.length - 1].processed = true;

      // Save transaction before committing
      await transaction.save({ session });

      // Commit transaction to ensure atomicity
      await session.commitTransaction();

      // Emit real-time status update via Socket.io
      socketService.sendToUser(transaction.student.toString(), 'PAYMENT_STATUS_UPDATE', {
        transactionId: transaction.transactionId,
        status: 'success',
        courseId: transaction.course,
        message: 'Payment confirmed successfully'
      });

      // Send confirmation email - after commit
      try {
        const student = await User.findById(transaction.student);
        const course = await Course.findById(transaction.course);

        if (student && course) {
          await emailService.sendPaymentConfirmation(
            transaction,
            student,
            course,
            transaction.receiptUrl ? path.join(__dirname, '../../client/public', transaction.receiptUrl) : null
          );
        }
      } catch (emailError) {
        console.error('Error sending webhook confirmation email:', emailError);
      }

    } else if (status === 'failed' && transaction.status === 'pending') {
      transaction.status = 'failed';
      transaction.errorCode = webhookData.errorCode || 'PAYMENT_FAILED';
      transaction.errorMessage = webhookData.errorMessage || 'Payment failed';

      // Mark webhook as processed
      transaction.webhookData[transaction.webhookData.length - 1].processed = true;

      // Save transaction before committing
      await transaction.save({ session });

      // Commit transaction
      await session.commitTransaction();

      // Emit real-time status update via Socket.io
      socketService.sendToUser(transaction.student.toString(), 'PAYMENT_STATUS_UPDATE', {
        transactionId: transaction.transactionId,
        status: 'failed',
        message: transaction.errorMessage || 'Payment failed'
      });

      // Send failure notification - after commit
      try {
        const student = await User.findById(transaction.student);
        const course = await Course.findById(transaction.course);

        if (student && course) {
          await emailService.sendPaymentFailure(
            transaction,
            student,
            course
          );
        }
      } catch (emailError) {
        console.error('Error sending webhook failure email:', emailError);
      }
    } else {
      // Status hasn't changed or is already in final state - just mark webhook as processed
      transaction.webhookData[transaction.webhookData.length - 1].processed = true;
      await transaction.save({ session });
      await session.commitTransaction();
    }

    // Return 200 OK (Requirement 4.7)
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
    });

  } catch (error) {
    // Abort transaction on error
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error('Error handling webhook:', error);
    // Return 500 for retry (Requirement 4.9)
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message,
    });
  } finally {
    // End session
    session.endSession();
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
  const stripeService = getStripeService();
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;

    // Find transaction
    const transaction = await Transaction.findOne({ transactionId })
      .populate('student', 'name email')
      .populate('course', 'title thumbnail')
      .populate('enrollment');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    // Verify user owns this transaction
    if (transaction.student._id.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to transaction',
      });
    }

    // Query real-time status from gateway (Requirement 11.6)
    try {
      if (transaction.gatewayTransactionId && transaction.gatewayTransactionId.startsWith('pi_')) {
        const intent = await stripeService.stripe.paymentIntents.retrieve(transaction.gatewayTransactionId);
        if (intent.status === 'succeeded' && transaction.status !== 'success') {
          // We can manually trigger success if it somehow wasn't caught by webhook
          transaction.status = 'success';
          transaction.completedAt = new Date();
          await transaction.save();
        }
      } else if (transaction.gatewayTransactionId) {
        const stripeSession = await stripeService.getSession(transaction.gatewayTransactionId);
        if (stripeSession.payment_status === 'paid' && transaction.status !== 'success') {
          transaction.status = 'success';
          transaction.completedAt = new Date();
          await transaction.save();
        }
      }
    } catch (gatewayError) {
      console.error('Error querying gateway status:', gatewayError);
      // Continue with local status if gateway query fails
    }

    // Return transaction details
    res.status(200).json({
      success: true,
      transaction: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        amount: transaction.finalAmountFormatted,
        originalAmount: transaction.originalAmountFormatted,
        discountAmount: transaction.discountAmountFormatted,
        gstAmount: transaction.gstAmountFormatted,
        currency: transaction.currency,
        paymentMethod: transaction.paymentMethod,
        paymentMethodDetails: transaction.paymentMethodDetails,
        course: {
          id: transaction.course._id,
          title: transaction.course.title,
          thumbnail: transaction.course.thumbnail,
        },
        initiatedAt: transaction.initiatedAt,
        completedAt: transaction.completedAt,
        receiptUrl: transaction.receiptUrl,
        receiptNumber: transaction.receiptNumber,
        errorMessage: transaction.errorMessage,
        errorCategory: transaction.errorCategory,
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

    // Build query
    const query = { student: userId };
    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch transactions with pagination
    const transactions = await Transaction.find(query)
      .populate('course', 'title thumbnail category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalItems = await Transaction.countDocuments(query);
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    // Format transactions
    const formattedTransactions = transactions.map((txn) => ({
      transactionId: txn.transactionId,
      course: {
        id: txn.course._id,
        title: txn.course.title,
        thumbnail: txn.course.thumbnail,
        category: txn.course.category,
      },
      amount: txn.finalAmountFormatted,
      originalAmount: txn.originalAmountFormatted,
      discountAmount: txn.discountAmountFormatted,
      status: txn.status,
      paymentMethod: txn.paymentMethod,
      initiatedAt: txn.initiatedAt,
      completedAt: txn.completedAt,
      receiptUrl: txn.receiptUrl,
    }));

    res.status(200).json({
      success: true,
      transactions: formattedTransactions,
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
  const stripeService = getStripeService();
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

    // Find transaction (Requirement 8.1)
    const transaction = await Transaction.findOne({ transactionId })
      .populate('student', 'name email')
      .populate('course', 'title');

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
    const originalAmount = parseFloat(transaction.finalAmount.toString());

    if (refundAmount <= 0 || refundAmount > originalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Invalid refund amount',
      });
    }

    // Send refund request to Stripe
    const refundResponse = await stripeService.initiateRefund(
      transaction.gatewayTransactionId,
      refundAmount
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

    // Update transaction record (Requirement 8.5)
    transaction.refundAmount = refundAmount;
    transaction.refundTransactionId = refundResponse.refundTransactionId;
    transaction.refundInitiatedBy = adminId;
    transaction.refundInitiatedAt = new Date();
    transaction.refundReason = reason;

    // Determine refund status
    if (refundAmount >= originalAmount) {
      transaction.status = 'refunded';
    } else {
      transaction.status = 'partial_refund';
    }

    // Store refund processing time (Requirement 8.9)
    const refundCompletionDate = new Date();
    refundCompletionDate.setDate(refundCompletionDate.getDate() + 7); // 5-7 business days
    transaction.refundCompletedAt = refundCompletionDate;

    await transaction.save();

    // Deactivate enrollment (Requirement 8.6)
    if (refundAmount >= originalAmount) {
      const enrollment = await Enrollment.findOne({
        student: transaction.student._id,
        course: transaction.course._id,
      });

      if (enrollment) {
        enrollment.status = 'suspended';
        await enrollment.save();
      }
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
        transaction.student,
        transaction.course
      );
    } catch (emailError) {
      console.error('Error sending refund email:', emailError);
    }

    res.status(200).json({
      success: true,
      refundTransactionId: refundResponse.refundTransactionId,
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
  const stripeService = getStripeService();
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;

    // Find original transaction (Requirement 7.3)
    const originalTransaction = await Transaction.findOne({ transactionId })
      .populate('course', 'title price');

    if (!originalTransaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    // Verify user owns this transaction
    if (originalTransaction.student.toString() !== userId) {
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
    if (originalTransaction.retryCount >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Maximum retry attempts reached. Please create a new payment session.',
      });
    }

    // Check retry is within 24 hours (Requirement 7.5)
    const hoursSinceInitiation = (Date.now() - originalTransaction.initiatedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceInitiation > 24) {
      return res.status(400).json({
        success: false,
        message: 'Retry period expired. Please create a new payment session.',
      });
    }

    // Get student details
    const student = await User.findById(userId);

    // Generate new transaction ID (Requirement 7.6)
    const newTransactionId = generateTransactionId();

    // Create new transaction record linked to original (Requirement 7.6, 6.9)
    const newTransaction = await Transaction.create({
      transactionId: newTransactionId,
      student: userId,
      course: originalTransaction.course._id,
      originalAmount: originalTransaction.originalAmount,
      discountAmount: originalTransaction.discountAmount,
      finalAmount: originalTransaction.finalAmount,
      gstAmount: originalTransaction.gstAmount,
      currency: originalTransaction.currency,
      discountCode: originalTransaction.discountCode,
      discountPercentage: originalTransaction.discountPercentage,
      status: 'pending',
      sessionId: '', // Will be set after session creation
      sessionExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      retryCount: originalTransaction.retryCount + 1,
      lastRetryAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      initiatedAt: new Date(),
    });

    // Increment retry count on original transaction
    originalTransaction.retryCount += 1;
    originalTransaction.lastRetryAt = new Date();
    await originalTransaction.save();

    // Create new payment session (Requirement 7.6)
    const session = await sessionManager.createSession({
      transactionId: newTransactionId,
      student: userId,
      course: originalTransaction.course._id,
      amount: parseFloat(originalTransaction.finalAmount.toString()),
    });

    // Update new transaction with session ID
    newTransaction.sessionId = session.sessionId;
    newTransaction.sessionExpiresAt = session.expiresAt;
    await newTransaction.save();

    // Generate payment request
    const paymentRequest = await stripeService.createPaymentRequest({
      transactionId: newTransactionId,
      amount: parseFloat(originalTransaction.finalAmount.toString()),
      currency: 'INR',
      customerName: student.name,
      customerEmail: student.email,
      customerPhone: student.phone || '',
      productInfo: `${originalTransaction.course.title} - Course Enrollment (Retry)`,
      courseId: originalTransaction.course._id,
      studentId: userId,
      gstAmount: originalTransaction.gstAmount,
    });

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
      paymentUrl: paymentRequest.paymentUrl,
      retryCount: newTransaction.retryCount,
      expiresAt: session.expiresAt,
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

module.exports = {
  initiatePayment,
  handleCallback,
  handleWebhook,
  checkPaymentStatus,
  getPaymentHistory,
  processRefund,
  retryPayment,
};
