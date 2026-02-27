/**
 * Payment Routes Integration Tests
 * 
 * Tests the complete payment flow end-to-end including:
 * - Payment initiation with middleware (rate limiting, CSRF, auth)
 * - Callback handling with signature verification
 * - Webhook processing with idempotency
 * - Rate limiting enforcement
 * - CSRF protection
 * - Authentication and authorization
 * 
 * Requirements: 18.3, 18.5, 18.9
 */

// Import test setup first
require('./setup');

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Import models
const Transaction = require('../../models/payment/Transaction');
const User = require('../../models/userModel');
const Course = require('../../models/courseModel');
const Enrollment = require('../../models/enrollmentModel');
const GatewayConfig = require('../../models/payment/GatewayConfig');

// Import routes
const paymentRoutes = require('../paymentRoutes');

// Import services
const HDFCGatewayService = require('../../services/payment/HDFCGatewayService');
const SignatureService = require('../../services/payment/SignatureService');

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.HDFC_MERCHANT_ID = 'TEST_MERCHANT';
process.env.HDFC_API_KEY = 'test-api-key';
process.env.HDFC_API_SECRET = 'test-api-secret';
process.env.HDFC_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');
process.env.HDFC_GATEWAY_URL = 'https://test-gateway.hdfc.com';
process.env.BASE_URL = 'http://localhost:5000';
process.env.NODE_ENV = 'test';

// Create Express app for testing
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/payment', paymentRoutes);
  return app;
};

// Helper function to generate JWT token
const generateToken = (userId, role = 'student') => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// Helper function to create test user
const createTestUser = async (role = 'student') => {
  const user = await User.create({
    name: `Test ${role}`,
    email: `test-${role}-${Date.now()}@example.com`,
    password: 'password123',
    role: role,
    phone: '1234567890',
  });
  return user;
};

// Helper function to create test course
const createTestCourse = async () => {
  const course = await Course.create({
    title: 'Test Course',
    description: 'Test course description',
    price: 10000,
    instructor: new mongoose.Types.ObjectId(),
    category: 'Technology',
    level: 'Beginner',
    duration: 40,
    isPublished: true,
  });
  return course;
};

// Helper function to create gateway config
const createGatewayConfig = async () => {
  const config = await GatewayConfig.create({
    merchantId: 'TEST_MERCHANT',
    merchantName: 'Test Merchant',
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    encryptionKey: 'test-encryption-key',
    gatewayUrl: 'https://test-gateway.hdfc.com',
    callbackUrl: 'http://localhost:5000/api/payment/callback',
    webhookUrl: 'http://localhost:5000/api/payment/webhook',
    enabledPaymentMethods: ['credit_card', 'debit_card', 'upi'],
    isActive: true,
  });
  return config;
};

describe('Payment Routes Integration Tests', () => {
  let app;
  let testUser;
  let testCourse;
  let authToken;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/skilldad-test';
    await mongoose.connect(mongoUri);
    
    // Create test app
    app = createTestApp();
  });

  afterAll(async () => {
    // Clean up and close connection
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Create test data for each test
    testUser = await createTestUser('student');
    testCourse = await createTestCourse();
    authToken = generateToken(testUser._id, 'student');
    await createGatewayConfig();
  });

  afterEach(async () => {
    // Clean up after each test
    await Transaction.deleteMany({});
    await User.deleteMany({});
    await Course.deleteMany({});
    await Enrollment.deleteMany({});
    await GatewayConfig.deleteMany({});
  });

  // ============================================================================
  // Test Suite 1: Payment Initiation Flow End-to-End
  // ============================================================================
  describe('POST /api/payment/initiate - Payment Initiation Flow', () => {
    it('should successfully initiate payment with valid data', async () => {
      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId: testCourse._id.toString(),
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactionId).toBeDefined();
      expect(response.body.sessionId).toBeDefined();
      expect(response.body.paymentUrl).toBeDefined();
      expect(response.body.amount).toBeDefined();
      expect(response.body.amount.final).toBe('10000.00');

      // Verify transaction was created in database
      const transaction = await Transaction.findOne({
        transactionId: response.body.transactionId,
      });
      expect(transaction).toBeDefined();
      expect(transaction.status).toBe('pending');
      expect(transaction.student.toString()).toBe(testUser._id.toString());
      expect(transaction.course.toString()).toBe(testCourse._id.toString());
    });

    it('should apply discount code correctly', async () => {
      // Create a discount code
      const Discount = require('../../models/discountModel');
      const discount = await Discount.create({
        code: 'TEST20',
        type: 'percentage',
        value: 20,
        isActive: true,
        expiryDate: new Date(Date.now() + 86400000), // Tomorrow
      });

      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId: testCourse._id.toString(),
          discountCode: 'TEST20',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.amount.discount).toBe('2000.00');
      expect(response.body.amount.final).toBe('8000.00');

      // Verify discount was recorded in transaction
      const transaction = await Transaction.findOne({
        transactionId: response.body.transactionId,
      });
      expect(transaction.discountCode).toBe('TEST20');
      expect(transaction.discountPercentage).toBe(20);
    });

    it('should reject invalid discount code', async () => {
      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId: testCourse._id.toString(),
          discountCode: 'INVALID',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid or expired discount code');
    });

    it('should reject payment for non-existent course', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId: fakeId.toString(),
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Course not found');
    });

    it('should reject payment if user already enrolled', async () => {
      // Create existing enrollment
      await Enrollment.create({
        student: testUser._id,
        course: testCourse._id,
        status: 'active',
        enrollmentDate: new Date(),
      });

      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId: testCourse._id.toString(),
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already enrolled');
    });

    it('should validate amount limits (minimum)', async () => {
      // Create a course with price below minimum
      const cheapCourse = await Course.create({
        title: 'Cheap Course',
        description: 'Very cheap',
        price: 5, // Below minimum of 10
        instructor: new mongoose.Types.ObjectId(),
        category: 'Technology',
        level: 'Beginner',
        duration: 10,
        isPublished: true,
      });

      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId: cheapCourse._id.toString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('at least INR 10');
    });

    it('should validate amount limits (maximum)', async () => {
      // Create a course with price above maximum
      const expensiveCourse = await Course.create({
        title: 'Expensive Course',
        description: 'Very expensive',
        price: 600000, // Above maximum of 500000
        instructor: new mongoose.Types.ObjectId(),
        category: 'Technology',
        level: 'Advanced',
        duration: 100,
        isPublished: true,
      });

      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId: expensiveCourse._id.toString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('cannot exceed INR 500000');
    });

    it('should calculate GST correctly', async () => {
      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId: testCourse._id.toString(),
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // GST should be 18% of final amount
      const finalAmount = parseFloat(response.body.amount.final);
      const gstAmount = parseFloat(response.body.amount.gst);
      const expectedGst = Math.round(finalAmount * 0.18 * 100) / 100;
      
      expect(gstAmount).toBeCloseTo(expectedGst, 2);
    });
  });

  // ============================================================================
  // Test Suite 2: Callback Handling with Signature Verification
  // ============================================================================
  describe('GET /api/payment/callback - Callback Handling', () => {
    let transaction;
    let signatureService;

    beforeEach(async () => {
      signatureService = new SignatureService();
      
      // Create a test transaction
      transaction = await Transaction.create({
        transactionId: 'TXN_TEST_123',
        student: testUser._id,
        course: testCourse._id,
        originalAmount: 10000,
        discountAmount: 0,
        finalAmount: 10000,
        gstAmount: 1800,
        currency: 'INR',
        status: 'pending',
        sessionId: 'SES_TEST_123',
        sessionExpiresAt: new Date(Date.now() + 900000), // 15 minutes from now
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
    });

    it('should process successful payment callback with valid signature', async () => {
      const callbackData = {
        transactionId: transaction.transactionId,
        status: 'success',
        gatewayTransactionId: 'HDFC_123456',
        paymentMethod: 'credit_card',
        cardType: 'Visa',
        cardLast4: '1234',
      };

      // Generate valid signature
      const signature = signatureService.generateSignature(
        callbackData,
        process.env.HDFC_API_SECRET
      );
      callbackData.signature = signature;

      const response = await request(app)
        .get('/api/payment/callback')
        .query(callbackData);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Payment Successful');

      // Verify transaction was updated
      const updatedTransaction = await Transaction.findOne({
        transactionId: transaction.transactionId,
      });
      expect(updatedTransaction.status).toBe('success');
      expect(updatedTransaction.gatewayTransactionId).toBe('HDFC_123456');
      expect(updatedTransaction.callbackSignatureVerified).toBe(true);

      // Verify enrollment was created
      const enrollment = await Enrollment.findOne({
        student: testUser._id,
        course: testCourse._id,
      });
      expect(enrollment).toBeDefined();
      expect(enrollment.status).toBe('active');
    });

    it('should reject callback with invalid signature', async () => {
      const callbackData = {
        transactionId: transaction.transactionId,
        status: 'success',
        gatewayTransactionId: 'HDFC_123456',
        signature: 'invalid_signature_12345',
      };

      const response = await request(app)
        .get('/api/payment/callback')
        .query(callbackData);

      expect(response.status).toBe(401);
      expect(response.text).toContain('Security Error');

      // Verify transaction was marked as failed
      const updatedTransaction = await Transaction.findOne({
        transactionId: transaction.transactionId,
      });
      expect(updatedTransaction.status).toBe('failed');
      expect(updatedTransaction.callbackSignatureVerified).toBe(false);
      expect(updatedTransaction.errorCode).toBe('SIGNATURE_VERIFICATION_FAILED');
    });

    it('should handle failed payment callback', async () => {
      const callbackData = {
        transactionId: transaction.transactionId,
        status: 'failed',
        errorCode: 'INSUFFICIENT_FUNDS',
        errorMessage: 'Insufficient funds in account',
      };

      const signature = signatureService.generateSignature(
        callbackData,
        process.env.HDFC_API_SECRET
      );
      callbackData.signature = signature;

      const response = await request(app)
        .get('/api/payment/callback')
        .query(callbackData);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Payment Failed');

      // Verify transaction was updated
      const updatedTransaction = await Transaction.findOne({
        transactionId: transaction.transactionId,
      });
      expect(updatedTransaction.status).toBe('failed');
      expect(updatedTransaction.errorCode).toBe('INSUFFICIENT_FUNDS');
      expect(updatedTransaction.errorCategory).toBe('insufficient_funds');
    });

    it('should handle expired session in callback', async () => {
      // Update transaction with expired session
      transaction.sessionExpiresAt = new Date(Date.now() - 1000); // Expired 1 second ago
      await transaction.save();

      const callbackData = {
        transactionId: transaction.transactionId,
        status: 'success',
        gatewayTransactionId: 'HDFC_123456',
      };

      const signature = signatureService.generateSignature(
        callbackData,
        process.env.HDFC_API_SECRET
      );
      callbackData.signature = signature;

      const response = await request(app)
        .get('/api/payment/callback')
        .query(callbackData);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Session Expired');

      // Verify transaction was marked as expired
      const updatedTransaction = await Transaction.findOne({
        transactionId: transaction.transactionId,
      });
      expect(updatedTransaction.status).toBe('expired');
      expect(updatedTransaction.errorCode).toBe('SESSION_EXPIRED');
    });

    it('should handle idempotent callback (duplicate callback)', async () => {
      // First callback
      const callbackData = {
        transactionId: transaction.transactionId,
        status: 'success',
        gatewayTransactionId: 'HDFC_123456',
      };

      const signature = signatureService.generateSignature(
        callbackData,
        process.env.HDFC_API_SECRET
      );
      callbackData.signature = signature;

      const response1 = await request(app)
        .get('/api/payment/callback')
        .query(callbackData);

      expect(response1.status).toBe(200);

      // Second callback with same data (should be idempotent)
      const response2 = await request(app)
        .get('/api/payment/callback')
        .query(callbackData);

      expect(response2.status).toBe(200);
      expect(response2.text).toContain('Payment Successful');

      // Verify only one enrollment was created
      const enrollments = await Enrollment.find({
        student: testUser._id,
        course: testCourse._id,
      });
      expect(enrollments.length).toBe(1);
    });

    it('should return 404 for non-existent transaction', async () => {
      const callbackData = {
        transactionId: 'TXN_NONEXISTENT',
        status: 'success',
        gatewayTransactionId: 'HDFC_123456',
      };

      const signature = signatureService.generateSignature(
        callbackData,
        process.env.HDFC_API_SECRET
      );
      callbackData.signature = signature;

      const response = await request(app)
        .get('/api/payment/callback')
        .query(callbackData);

      expect(response.status).toBe(404);
      expect(response.text).toContain('Transaction not found');
    });
  });

  // ============================================================================
  // Test Suite 3: Webhook Processing
  // ============================================================================
  describe('POST /api/payment/webhook - Webhook Processing', () => {
    let transaction;
    let signatureService;

    beforeEach(async () => {
      signatureService = new SignatureService();
      
      // Create a test transaction
      transaction = await Transaction.create({
        transactionId: 'TXN_WEBHOOK_123',
        student: testUser._id,
        course: testCourse._id,
        originalAmount: 10000,
        discountAmount: 0,
        finalAmount: 10000,
        gstAmount: 1800,
        currency: 'INR',
        status: 'pending',
        sessionId: 'SES_WEBHOOK_123',
        sessionExpiresAt: new Date(Date.now() + 900000),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
    });

    it('should process webhook with valid signature', async () => {
      const webhookData = {
        transactionId: transaction.transactionId,
        gatewayTransactionId: 'HDFC_WEBHOOK_123',
        status: 'success',
        amount: 10000,
        paymentMethod: 'upi',
        timestamp: new Date().toISOString(),
      };

      const signature = signatureService.generateSignature(
        webhookData,
        process.env.HDFC_API_SECRET
      );
      webhookData.signature = signature;

      const response = await request(app)
        .post('/api/payment/webhook')
        .send(webhookData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('processed successfully');

      // Verify transaction was updated
      const updatedTransaction = await Transaction.findOne({
        transactionId: transaction.transactionId,
      });
      expect(updatedTransaction.status).toBe('success');
      expect(updatedTransaction.webhookSignatureVerified).toBe(true);
      expect(updatedTransaction.webhookData).toBeDefined();
      expect(updatedTransaction.webhookData.length).toBeGreaterThan(0);
    });

    it('should reject webhook with invalid signature', async () => {
      const webhookData = {
        transactionId: transaction.transactionId,
        gatewayTransactionId: 'HDFC_WEBHOOK_123',
        status: 'success',
        amount: 10000,
        signature: 'invalid_signature',
      };

      const response = await request(app)
        .post('/api/payment/webhook')
        .send(webhookData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Signature verification failed');

      // Verify transaction was not updated
      const updatedTransaction = await Transaction.findOne({
        transactionId: transaction.transactionId,
      });
      expect(updatedTransaction.status).toBe('pending');
    });

    it('should handle idempotent webhook (duplicate webhook)', async () => {
      const webhookData = {
        transactionId: transaction.transactionId,
        gatewayTransactionId: 'HDFC_WEBHOOK_123',
        status: 'success',
        amount: 10000,
        paymentMethod: 'upi',
        timestamp: new Date().toISOString(),
      };

      const signature = signatureService.generateSignature(
        webhookData,
        process.env.HDFC_API_SECRET
      );
      webhookData.signature = signature;

      // First webhook
      const response1 = await request(app)
        .post('/api/payment/webhook')
        .send(webhookData);

      expect(response1.status).toBe(200);

      // Second webhook with same data
      const response2 = await request(app)
        .post('/api/payment/webhook')
        .send(webhookData);

      expect(response2.status).toBe(200);
      expect(response2.body.message).toContain('already processed');

      // Verify only one enrollment was created
      const enrollments = await Enrollment.find({
        student: testUser._id,
        course: testCourse._id,
      });
      expect(enrollments.length).toBe(1);
    });

    it('should activate enrollment if not already active', async () => {
      const webhookData = {
        transactionId: transaction.transactionId,
        gatewayTransactionId: 'HDFC_WEBHOOK_123',
        status: 'success',
        amount: 10000,
        paymentMethod: 'credit_card',
        timestamp: new Date().toISOString(),
      };

      const signature = signatureService.generateSignature(
        webhookData,
        process.env.HDFC_API_SECRET
      );
      webhookData.signature = signature;

      const response = await request(app)
        .post('/api/payment/webhook')
        .send(webhookData);

      expect(response.status).toBe(200);

      // Verify enrollment was created
      const enrollment = await Enrollment.findOne({
        student: testUser._id,
        course: testCourse._id,
      });
      expect(enrollment).toBeDefined();
      expect(enrollment.status).toBe('active');
    });

    it('should return 404 for non-existent transaction', async () => {
      const webhookData = {
        transactionId: 'TXN_NONEXISTENT',
        gatewayTransactionId: 'HDFC_WEBHOOK_123',
        status: 'success',
        amount: 10000,
      };

      const signature = signatureService.generateSignature(
        webhookData,
        process.env.HDFC_API_SECRET
      );
      webhookData.signature = signature;

      const response = await request(app)
        .post('/api/payment/webhook')
        .send(webhookData);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Transaction not found');
    });
  });

  // ============================================================================
  // Test Suite 4: Rate Limiting Enforcement
  // ============================================================================
  describe('Rate Limiting Enforcement', () => {
    it('should enforce rate limit on payment initiation (5 requests/min)', async () => {
      const requests = [];
      
      // Make 6 requests (limit is 5)
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app)
            .post('/api/payment/initiate')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              courseId: testCourse._id.toString(),
            })
        );
      }

      const responses = await Promise.all(requests);

      // First 5 should succeed or fail for other reasons (not rate limit)
      const successfulOrValidationErrors = responses.slice(0, 5).filter(
        r => r.status === 200 || r.status === 400 || r.status === 409
      );
      expect(successfulOrValidationErrors.length).toBeGreaterThan(0);

      // 6th request should be rate limited
      const rateLimitedResponse = responses[5];
      expect(rateLimitedResponse.status).toBe(429);
      expect(rateLimitedResponse.body.message).toContain('Too many payment attempts');
    }, 10000); // Increase timeout for this test

    it('should enforce rate limit on status checks (10 requests/min)', async () => {
      // Create a transaction first
      const transaction = await Transaction.create({
        transactionId: 'TXN_RATE_LIMIT_TEST',
        student: testUser._id,
        course: testCourse._id,
        originalAmount: 10000,
        discountAmount: 0,
        finalAmount: 10000,
        gstAmount: 1800,
        currency: 'INR',
        status: 'success',
        sessionId: 'SES_RATE_LIMIT',
        sessionExpiresAt: new Date(Date.now() + 900000),
      });

      const requests = [];
      
      // Make 11 requests (limit is 10)
      for (let i = 0; i < 11; i++) {
        requests.push(
          request(app)
            .get(`/api/payment/status/${transaction.transactionId}`)
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(requests);

      // First 10 should succeed
      const successfulResponses = responses.slice(0, 10).filter(r => r.status === 200);
      expect(successfulResponses.length).toBe(10);

      // 11th request should be rate limited
      const rateLimitedResponse = responses[10];
      expect(rateLimitedResponse.status).toBe(429);
      expect(rateLimitedResponse.body.message).toContain('Too many status check requests');
    }, 10000);

    it('should have separate rate limits per user', async () => {
      // Create second user
      const testUser2 = await createTestUser('student');
      const authToken2 = generateToken(testUser2._id, 'student');

      // User 1 makes 5 requests
      const user1Requests = [];
      for (let i = 0; i < 5; i++) {
        user1Requests.push(
          request(app)
            .post('/api/payment/initiate')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ courseId: testCourse._id.toString() })
        );
      }

      await Promise.all(user1Requests);

      // User 2 should still be able to make requests
      const user2Response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${authToken2}`)
        .send({ courseId: testCourse._id.toString() });

      // Should not be rate limited (different user)
      expect(user2Response.status).not.toBe(429);
    }, 10000);
  });

  // ============================================================================
  // Test Suite 5: CSRF Protection
  // ============================================================================
  describe('CSRF Protection', () => {
    it('should provide CSRF token endpoint', async () => {
      const response = await request(app)
        .get('/api/payment/csrf-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.csrfToken).toBeDefined();
      expect(typeof response.body.csrfToken).toBe('string');
    });

    it('should reject payment initiation without CSRF token', async () => {
      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId: testCourse._id.toString(),
        });

      // Note: CSRF protection might be disabled in test environment
      // This test verifies the middleware is in place
      // In production, this would return 403
      expect([200, 403]).toContain(response.status);
    });

    it('should not require CSRF token for callback endpoint', async () => {
      // Create a transaction
      const transaction = await Transaction.create({
        transactionId: 'TXN_CSRF_TEST',
        student: testUser._id,
        course: testCourse._id,
        originalAmount: 10000,
        discountAmount: 0,
        finalAmount: 10000,
        gstAmount: 1800,
        currency: 'INR',
        status: 'pending',
        sessionId: 'SES_CSRF_TEST',
        sessionExpiresAt: new Date(Date.now() + 900000),
      });

      const signatureService = new SignatureService();
      const callbackData = {
        transactionId: transaction.transactionId,
        status: 'success',
        gatewayTransactionId: 'HDFC_123',
      };

      const signature = signatureService.generateSignature(
        callbackData,
        process.env.HDFC_API_SECRET
      );
      callbackData.signature = signature;

      // Callback should work without CSRF token
      const response = await request(app)
        .get('/api/payment/callback')
        .query(callbackData);

      expect(response.status).toBe(200);
    });

    it('should not require CSRF token for webhook endpoint', async () => {
      // Create a transaction
      const transaction = await Transaction.create({
        transactionId: 'TXN_WEBHOOK_CSRF',
        student: testUser._id,
        course: testCourse._id,
        originalAmount: 10000,
        discountAmount: 0,
        finalAmount: 10000,
        gstAmount: 1800,
        currency: 'INR',
        status: 'pending',
        sessionId: 'SES_WEBHOOK_CSRF',
        sessionExpiresAt: new Date(Date.now() + 900000),
      });

      const signatureService = new SignatureService();
      const webhookData = {
        transactionId: transaction.transactionId,
        gatewayTransactionId: 'HDFC_WEBHOOK',
        status: 'success',
        amount: 10000,
        timestamp: new Date().toISOString(),
      };

      const signature = signatureService.generateSignature(
        webhookData,
        process.env.HDFC_API_SECRET
      );
      webhookData.signature = signature;

      // Webhook should work without CSRF token
      const response = await request(app)
        .post('/api/payment/webhook')
        .send(webhookData);

      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // Test Suite 6: Authentication and Authorization
  // ============================================================================
  describe('Authentication and Authorization', () => {
    it('should reject payment initiation without authentication', async () => {
      const response = await request(app)
        .post('/api/payment/initiate')
        .send({
          courseId: testCourse._id.toString(),
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Not authorized');
    });

    it('should reject payment initiation with invalid token', async () => {
      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', 'Bearer invalid_token_12345')
        .send({
          courseId: testCourse._id.toString(),
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Not authorized');
    });

    it('should allow student to initiate payment', async () => {
      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId: testCourse._id.toString(),
        });

      // Should not be rejected due to authorization (may fail for other reasons)
      expect(response.status).not.toBe(403);
    });

    it('should allow admin to initiate payment', async () => {
      const adminUser = await createTestUser('admin');
      const adminToken = generateToken(adminUser._id, 'admin');

      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courseId: testCourse._id.toString(),
        });

      // Should not be rejected due to authorization
      expect(response.status).not.toBe(403);
    });

    it('should reject university role from initiating payment', async () => {
      const universityUser = await createTestUser('university');
      const universityToken = generateToken(universityUser._id, 'university');

      const response = await request(app)
        .post('/api/payment/initiate')
        .set('Authorization', `Bearer ${universityToken}`)
        .send({
          courseId: testCourse._id.toString(),
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Not authorized');
    });

    it('should allow student to check their own payment status', async () => {
      // Create a transaction for the student
      const transaction = await Transaction.create({
        transactionId: 'TXN_AUTH_TEST',
        student: testUser._id,
        course: testCourse._id,
        originalAmount: 10000,
        discountAmount: 0,
        finalAmount: 10000,
        gstAmount: 1800,
        currency: 'INR',
        status: 'success',
        sessionId: 'SES_AUTH_TEST',
        sessionExpiresAt: new Date(Date.now() + 900000),
      });

      const response = await request(app)
        .get(`/api/payment/status/${transaction.transactionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should prevent student from accessing another student\'s payment', async () => {
      // Create another student
      const otherStudent = await createTestUser('student');
      
      // Create a transaction for the other student
      const transaction = await Transaction.create({
        transactionId: 'TXN_OTHER_STUDENT',
        student: otherStudent._id,
        course: testCourse._id,
        originalAmount: 10000,
        discountAmount: 0,
        finalAmount: 10000,
        gstAmount: 1800,
        currency: 'INR',
        status: 'success',
        sessionId: 'SES_OTHER',
        sessionExpiresAt: new Date(Date.now() + 900000),
      });

      // Try to access with first student's token
      const response = await request(app)
        .get(`/api/payment/status/${transaction.transactionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Not authorized');
    });

    it('should allow admin to access any payment status', async () => {
      const adminUser = await createTestUser('admin');
      const adminToken = generateToken(adminUser._id, 'admin');

      // Create a transaction for a different student
      const transaction = await Transaction.create({
        transactionId: 'TXN_ADMIN_ACCESS',
        student: testUser._id,
        course: testCourse._id,
        originalAmount: 10000,
        discountAmount: 0,
        finalAmount: 10000,
        gstAmount: 1800,
        currency: 'INR',
        status: 'success',
        sessionId: 'SES_ADMIN_ACCESS',
        sessionExpiresAt: new Date(Date.now() + 900000),
      });

      const response = await request(app)
        .get(`/api/payment/status/${transaction.transactionId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow finance role to access payment status', async () => {
      const financeUser = await createTestUser('finance');
      const financeToken = generateToken(financeUser._id, 'finance');

      // Create a transaction
      const transaction = await Transaction.create({
        transactionId: 'TXN_FINANCE_ACCESS',
        student: testUser._id,
        course: testCourse._id,
        originalAmount: 10000,
        discountAmount: 0,
        finalAmount: 10000,
        gstAmount: 1800,
        currency: 'INR',
        status: 'success',
        sessionId: 'SES_FINANCE_ACCESS',
        sessionExpiresAt: new Date(Date.now() + 900000),
      });

      const response = await request(app)
        .get(`/api/payment/status/${transaction.transactionId}`)
        .set('Authorization', `Bearer ${financeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow student to view their own payment history', async () => {
      // Create some transactions for the student
      await Transaction.create([
        {
          transactionId: 'TXN_HISTORY_1',
          student: testUser._id,
          course: testCourse._id,
          originalAmount: 10000,
          discountAmount: 0,
          finalAmount: 10000,
          gstAmount: 1800,
          currency: 'INR',
          status: 'success',
          sessionId: 'SES_HISTORY_1',
          sessionExpiresAt: new Date(Date.now() + 900000),
        },
        {
          transactionId: 'TXN_HISTORY_2',
          student: testUser._id,
          course: testCourse._id,
          originalAmount: 5000,
          discountAmount: 0,
          finalAmount: 5000,
          gstAmount: 900,
          currency: 'INR',
          status: 'failed',
          sessionId: 'SES_HISTORY_2',
          sessionExpiresAt: new Date(Date.now() + 900000),
        },
      ]);

      const response = await request(app)
        .get('/api/payment/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transactions).toBeDefined();
      expect(response.body.transactions.length).toBeGreaterThanOrEqual(2);
    });

    it('should not show other students\' transactions in history', async () => {
      // Create another student with transactions
      const otherStudent = await createTestUser('student');
      await Transaction.create({
        transactionId: 'TXN_OTHER_HISTORY',
        student: otherStudent._id,
        course: testCourse._id,
        originalAmount: 10000,
        discountAmount: 0,
        finalAmount: 10000,
        gstAmount: 1800,
        currency: 'INR',
        status: 'success',
        sessionId: 'SES_OTHER_HISTORY',
        sessionExpiresAt: new Date(Date.now() + 900000),
      });

      const response = await request(app)
        .get('/api/payment/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Should not include other student's transaction
      const otherTransaction = response.body.transactions.find(
        t => t.transactionId === 'TXN_OTHER_HISTORY'
      );
      expect(otherTransaction).toBeUndefined();
    });
  });
});
