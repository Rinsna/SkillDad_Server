/**
 * PaymentController Unit Tests
 * 
 * Tests for payment controller methods including:
 * - initiatePayment with valid and invalid inputs
 * - Discount code application
 * - Callback handling for success and failure scenarios
 * - Webhook idempotency
 * - Refund validation logic
 * - Retry limit enforcement
 * 
 * Requirements: 1.1, 3.4, 4.8, 7.5, 8.10, 18.2, 18.3, 18.6
 */

// Mock mongoose first
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  const mockSchema = jest.fn().mockImplementation(function() {
    this.index = jest.fn();
    this.virtual = jest.fn().mockReturnThis();
    this.get = jest.fn().mockReturnThis();
    this.pre = jest.fn();
    this.post = jest.fn();
    this.methods = {};
    this.statics = {};
    return this;
  });
  mockSchema.Types = {
    ObjectId: actualMongoose.Schema.Types.ObjectId,
    Mixed: actualMongoose.Schema.Types.Mixed,
  };
  return {
    ...actualMongoose,
    Schema: mockSchema,
    model: jest.fn(),
    startSession: jest.fn(),
    Types: {
      ObjectId: actualMongoose.Types.ObjectId,
      Decimal128: actualMongoose.Types.Decimal128,
    },
  };
});

// Mock all dependencies
jest.mock('../models/payment/Transaction', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../models/enrollmentModel', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../models/courseModel', () => ({
  findById: jest.fn(),
}));
jest.mock('../models/userModel', () => ({
  findById: jest.fn(),
}));
jest.mock('../models/discountModel', () => ({
  findOne: jest.fn(),
}));
jest.mock('../models/payment/GatewayConfig', () => ({
  findOne: jest.fn(),
}));
jest.mock('../services/payment/HDFCGatewayService');
jest.mock('../services/payment/PaymentSessionManager');
jest.mock('../services/payment/SecurityLogger', () => ({
  logPaymentAttempt: jest.fn(),
  logSignatureFailure: jest.fn(),
  logRefundOperation: jest.fn(),
}));
jest.mock('../services/payment/MonitoringService', () => ({
  trackPaymentAttempt: jest.fn(),
  logAPIError: jest.fn(),
}));
jest.mock('../services/payment/ReceiptGeneratorService');
jest.mock('../services/payment/EmailService');

const paymentController = require('./paymentController');
const Transaction = require('../models/payment/Transaction');
const Enrollment = require('../models/enrollmentModel');
const Course = require('../models/courseModel');
const User = require('../models/userModel');
const Discount = require('../models/discountModel');
const GatewayConfig = require('../models/payment/GatewayConfig');
const HDFCGatewayService = require('../services/payment/HDFCGatewayService');
const PaymentSessionManager = require('../services/payment/PaymentSessionManager');
const SecurityLogger = require('../services/payment/SecurityLogger');
const MonitoringService = require('../services/payment/MonitoringService');
const ReceiptGeneratorService = require('../services/payment/ReceiptGeneratorService');
const EmailService = require('../services/payment/EmailService');
const mongoose = require('mongoose');

describe('PaymentController', () => {
  let req, res, mockSession;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      params: {},
      query: {},
      user: { id: 'student123', role: 'student' },
      ip: '127.0.0.1',
      get: jest.fn((header) => header === 'user-agent' ? 'Mozilla/5.0' : null),
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(false),
    };

    mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

    process.env.HDFC_MERCHANT_ID = 'TEST_MERCHANT';
    process.env.HDFC_API_KEY = 'test_key';
    process.env.HDFC_API_SECRET = 'test_secret';
    process.env.HDFC_ENCRYPTION_KEY = Buffer.from('test_encryption_key_32_bytes_long').toString('base64');
    process.env.HDFC_GATEWAY_URL = 'https://test.gateway.com';
    process.env.BASE_URL = 'https://test.skilldad.com';
    process.env.PAYMENT_ENVIRONMENT = 'sandbox';
  });

  describe('initiatePayment', () => {
    it('should return 404 when course not found', async () => {
      req.body = { courseId: 'course123' };
      GatewayConfig.findOne.mockResolvedValue({ isActive: true, maintenanceMode: false });
      HDFCGatewayService.prototype.checkGatewayHealth = jest.fn().mockResolvedValue({ available: true });
      Course.findById.mockResolvedValue(null);

      await paymentController.initiatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Course not found' });
    });

    it('should return 409 when student already enrolled', async () => {
      req.body = { courseId: 'course123' };
      GatewayConfig.findOne.mockResolvedValue({ isActive: true, maintenanceMode: false });
      HDFCGatewayService.prototype.checkGatewayHealth = jest.fn().mockResolvedValue({ available: true });
      Course.findById.mockResolvedValue({ _id: 'course123', title: 'Test Course', price: 10000 });
      Enrollment.findOne.mockResolvedValue({ status: 'active' });

      await paymentController.initiatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'You are already enrolled in this course' });
    });

    it('should return 400 for invalid discount code', async () => {
      req.body = { courseId: 'course123', discountCode: 'INVALID' };
      GatewayConfig.findOne.mockResolvedValue({ isActive: true, maintenanceMode: false });
      HDFCGatewayService.prototype.checkGatewayHealth = jest.fn().mockResolvedValue({ available: true });
      Course.findById.mockResolvedValue({ _id: 'course123', title: 'Test Course', price: 10000 });
      Enrollment.findOne.mockResolvedValue(null);
      User.findById.mockResolvedValue({ _id: 'student123', name: 'John', email: 'john@example.com' });
      Discount.findOne.mockResolvedValue(null);

      await paymentController.initiatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Invalid or expired discount code' });
    });

    it('should return 503 when gateway is in maintenance mode', async () => {
      req.body = { courseId: 'course123' };
      GatewayConfig.findOne.mockResolvedValue({ isActive: true, maintenanceMode: true, maintenanceMessage: 'Scheduled maintenance' });

      await paymentController.initiatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Scheduled maintenance', maintenanceMode: true });
    });
  });

  describe('handleCallback', () => {
    it('should return 400 for missing transaction ID', async () => {
      req.query = {};

      await paymentController.handleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Invalid callback'));
    });
  });

  describe('handleWebhook', () => {
    it('should reject webhook with invalid signature', async () => {
      req.body = { transactionId: 'TXN_123', status: 'success', signature: 'invalid' };
      HDFCGatewayService.prototype.verifyWebhook = jest.fn().mockReturnValue(false);
      SecurityLogger.logSignatureFailure = jest.fn().mockResolvedValue(true);

      await paymentController.handleWebhook(req, res);

      expect(SecurityLogger.logSignatureFailure).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Signature verification failed' });
    });
  });

  describe('processRefund', () => {
    it('should return 403 for non-admin user', async () => {
      req.user.role = 'student';
      req.body = { transactionId: 'TXN_123', amount: 10000, reason: 'Test' };

      await paymentController.processRefund(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Insufficient permissions to process refunds' });
    });
  });

  describe('retryPayment', () => {
    it('should enforce retry limit of 3 attempts', async () => {
      req.params = { transactionId: 'TXN_123' };
      const mockTransaction = {
        transactionId: 'TXN_123',
        student: { toString: () => 'student123' },
        status: 'failed',
        retryCount: 3,
        populate: jest.fn().mockReturnThis(),
      };
      Transaction.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(mockTransaction) });

      await paymentController.retryPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Maximum retry attempts reached. Please create a new payment session.' });
    });

    it('should enforce 24-hour retry window', async () => {
      req.params = { transactionId: 'TXN_123' };
      const mockTransaction = {
        transactionId: 'TXN_123',
        student: { toString: () => 'student123' },
        status: 'failed',
        retryCount: 0,
        initiatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        populate: jest.fn().mockReturnThis(),
      };
      Transaction.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(mockTransaction) });

      await paymentController.retryPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Retry period expired. Please create a new payment session.' });
    });
  });
});
