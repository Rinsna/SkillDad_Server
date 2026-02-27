const SecurityLogger = require('./SecurityLogger');
const AuditLog = require('../../models/payment/AuditLog');
const SecurityAlert = require('../../models/payment/SecurityAlert');
const User = require('../../models/userModel');

// Mock the models
jest.mock('../../models/payment/AuditLog');
jest.mock('../../models/payment/SecurityAlert');
jest.mock('../../models/userModel');
jest.mock('../../utils/sendEmail');

/**
 * Unit tests for SecurityLogger
 * 
 * Tests sensitive data masking, audit logging, and security alert functionality.
 * 
 * Requirements: 14.1, 14.2, 5.9
 */
describe('SecurityLogger', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('maskSensitiveData', () => {
    it('should mask card numbers showing only last 4 digits', () => {
      const data = {
        cardNumber: '1234567890123456',
        amount: 1000,
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.cardNumber).toBe('****3456');
      expect(masked.amount).toBe(1000);
    });

    it('should remove CVV from data', () => {
      const data = {
        cardNumber: '1234567890123456',
        cvv: '123',
        amount: 1000,
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.cvv).toBeUndefined();
      expect(masked.cardNumber).toBe('****3456');
    });

    it('should remove CVC from data', () => {
      const data = {
        cvc: '456',
        cardNumber: '1234567890123456',
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.cvc).toBeUndefined();
    });

    it('should remove PIN from data', () => {
      const data = {
        pin: '1234',
        cardNumber: '1234567890123456',
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.pin).toBeUndefined();
    });

    it('should remove password from data', () => {
      const data = {
        password: 'secret123',
        username: 'testuser',
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.password).toBeUndefined();
      expect(masked.username).toBe('testuser');
    });

    it('should remove API keys from data', () => {
      const data = {
        apiKey: 'sk_test_123456',
        apiSecret: 'secret_abc123',
        merchantId: 'MERCHANT_123',
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.apiKey).toBeUndefined();
      expect(masked.apiSecret).toBeUndefined();
      expect(masked.merchantId).toBe('MERCHANT_123');
    });

    it('should remove encryption keys from data', () => {
      const data = {
        encryptionKey: 'enc_key_123',
        data: 'some data',
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.encryptionKey).toBeUndefined();
      expect(masked.data).toBe('some data');
    });

    it('should mask account numbers', () => {
      const data = {
        accountNumber: '9876543210',
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.accountNumber).toBe('****3210');
    });

    it('should mask IBAN numbers', () => {
      const data = {
        iban: 'GB82WEST12345698765432',
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.iban).toBe('****5432');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          name: 'John Doe',
          payment: {
            cardNumber: '1234567890123456',
            cvv: '123',
          },
        },
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.user.name).toBe('John Doe');
      expect(masked.user.payment.cardNumber).toBe('****3456');
      expect(masked.user.payment.cvv).toBeUndefined();
    });

    it('should handle arrays of objects', () => {
      const data = {
        payments: [
          { cardNumber: '1111222233334444', cvv: '111' },
          { cardNumber: '5555666677778888', cvv: '222' },
        ],
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.payments[0].cardNumber).toBe('****4444');
      expect(masked.payments[0].cvv).toBeUndefined();
      expect(masked.payments[1].cardNumber).toBe('****8888');
      expect(masked.payments[1].cvv).toBeUndefined();
    });

    it('should handle case-insensitive field matching', () => {
      const data = {
        CardNumber: '1234567890123456',
        CVV: '123',
        cardPin: '4567',
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.CardNumber).toBe('****3456');
      expect(masked.CVV).toBeUndefined();
      expect(masked.cardPin).toBeUndefined();
    });

    it('should handle null data', () => {
      const masked = SecurityLogger.maskSensitiveData(null);
      expect(masked).toBeNull();
    });

    it('should handle undefined data', () => {
      const masked = SecurityLogger.maskSensitiveData(undefined);
      expect(masked).toBeUndefined();
    });

    it('should handle empty object', () => {
      const data = {};
      const masked = SecurityLogger.maskSensitiveData(data);
      expect(masked).toEqual({});
    });

    it('should not modify original data object', () => {
      const data = {
        cardNumber: '1234567890123456',
        cvv: '123',
      };

      const original = JSON.parse(JSON.stringify(data));
      SecurityLogger.maskSensitiveData(data);

      expect(data).toEqual(original);
    });

    it('should mask card numbers with less than 4 digits as ****', () => {
      const data = {
        cardNumber: '123',
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.cardNumber).toBe('****');
    });

    it('should remove OTP from data', () => {
      const data = {
        otp: '123456',
        transactionId: 'TXN_123',
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.otp).toBeUndefined();
      expect(masked.transactionId).toBe('TXN_123');
    });

    it('should remove tokens from data', () => {
      const data = {
        token: 'jwt_token_123',
        accessToken: 'access_123',
        refreshToken: 'refresh_456',
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.token).toBeUndefined();
      expect(masked.accessToken).toBeUndefined();
      expect(masked.refreshToken).toBeUndefined();
    });

    it('should handle deeply nested structures', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              cardNumber: '1234567890123456',
              cvv: '123',
              normalField: 'keep this',
            },
          },
        },
      };

      const masked = SecurityLogger.maskSensitiveData(data);

      expect(masked.level1.level2.level3.cardNumber).toBe('****3456');
      expect(masked.level1.level2.level3.cvv).toBeUndefined();
      expect(masked.level1.level2.level3.normalField).toBe('keep this');
    });
  });

  describe('logPaymentAttempt', () => {
    it('should log payment attempt with all details', async () => {
      const mockAuditLog = {
        _id: 'log123',
        event: 'payment_attempt',
        transactionId: 'TXN_123',
      };

      AuditLog.create.mockResolvedValue(mockAuditLog);

      const result = await SecurityLogger.logPaymentAttempt(
        'TXN_123',
        'user123',
        '192.168.1.1',
        'Mozilla/5.0',
        { amount: 1000 }
      );

      expect(AuditLog.create).toHaveBeenCalledWith({
        event: 'payment_attempt',
        transactionId: 'TXN_123',
        userId: 'user123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        details: { amount: 1000 },
        severity: 'info',
        timestamp: expect.any(Date),
      });

      expect(result).toEqual(mockAuditLog);
    });

    it('should mask sensitive data in additional details', async () => {
      AuditLog.create.mockResolvedValue({});

      await SecurityLogger.logPaymentAttempt(
        'TXN_123',
        'user123',
        '192.168.1.1',
        'Mozilla/5.0',
        { cardNumber: '1234567890123456', cvv: '123' }
      );

      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            cardNumber: '****3456',
          }),
        })
      );

      const callArgs = AuditLog.create.mock.calls[0][0];
      expect(callArgs.details.cvv).toBeUndefined();
    });

    it('should handle logging errors gracefully', async () => {
      AuditLog.create.mockRejectedValue(new Error('Database error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await SecurityLogger.logPaymentAttempt(
        'TXN_123',
        'user123',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error logging payment attempt:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('logSignatureFailure', () => {
    it('should create security alert for signature failure', async () => {
      const mockAlert = {
        _id: 'alert123',
        severity: 'high',
        event: 'signature_verification_failed',
      };

      SecurityAlert.create.mockResolvedValue(mockAlert);
      AuditLog.create.mockResolvedValue({});
      User.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });

      const result = await SecurityLogger.logSignatureFailure(
        '/api/payment/callback',
        { transactionId: 'TXN_123' },
        '192.168.1.1'
      );

      expect(SecurityAlert.create).toHaveBeenCalledWith({
        severity: 'high',
        event: 'signature_verification_failed',
        endpoint: '/api/payment/callback',
        ipAddress: '192.168.1.1',
        data: { transactionId: 'TXN_123' },
        description: 'Signature verification failed',
        status: 'open',
        timestamp: expect.any(Date),
      });

      expect(result).toEqual(mockAlert);
    });

    it('should create audit log entry for signature failure', async () => {
      const mockAlert = { _id: 'alert123' };

      SecurityAlert.create.mockResolvedValue(mockAlert);
      AuditLog.create.mockResolvedValue({});
      User.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });

      await SecurityLogger.logSignatureFailure(
        '/api/payment/webhook',
        {},
        '10.0.0.1'
      );

      expect(AuditLog.create).toHaveBeenCalledWith({
        event: 'signature_verification_failed',
        ipAddress: '10.0.0.1',
        details: {
          endpoint: '/api/payment/webhook',
          description: 'Signature verification failed',
          alertId: 'alert123',
        },
        severity: 'critical',
        timestamp: expect.any(Date),
      });
    });

    it('should mask sensitive data in alert', async () => {
      SecurityAlert.create.mockResolvedValue({ _id: 'alert123' });
      AuditLog.create.mockResolvedValue({});
      User.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });

      await SecurityLogger.logSignatureFailure(
        '/api/payment/callback',
        { cardNumber: '1234567890123456', cvv: '123' },
        '192.168.1.1'
      );

      const callArgs = SecurityAlert.create.mock.calls[0][0];
      expect(callArgs.data.cardNumber).toBe('****3456');
      expect(callArgs.data.cvv).toBeUndefined();
    });

    it('should handle custom description', async () => {
      SecurityAlert.create.mockResolvedValue({ _id: 'alert123' });
      AuditLog.create.mockResolvedValue({});
      User.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });

      await SecurityLogger.logSignatureFailure(
        '/api/payment/callback',
        {},
        '192.168.1.1',
        'Custom failure description'
      );

      expect(SecurityAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Custom failure description',
        })
      );
    });

    it('should handle errors gracefully', async () => {
      SecurityAlert.create.mockRejectedValue(new Error('Database error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await SecurityLogger.logSignatureFailure(
        '/api/payment/callback',
        {},
        '192.168.1.1'
      );

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('logRefundOperation', () => {
    it('should log refund operation with all details', async () => {
      const mockAuditLog = {
        _id: 'log123',
        event: 'refund_processed',
      };

      AuditLog.create.mockResolvedValue(mockAuditLog);

      const result = await SecurityLogger.logRefundOperation(
        'TXN_123',
        'admin123',
        5000,
        'Customer requested refund'
      );

      expect(AuditLog.create).toHaveBeenCalledWith({
        event: 'refund_processed',
        transactionId: 'TXN_123',
        userId: 'admin123',
        details: {
          amount: 5000,
          reason: 'Customer requested refund',
        },
        severity: 'warning',
        timestamp: expect.any(Date),
      });

      expect(result).toEqual(mockAuditLog);
    });

    it('should include additional details if provided', async () => {
      AuditLog.create.mockResolvedValue({});

      await SecurityLogger.logRefundOperation(
        'TXN_123',
        'admin123',
        5000,
        'Refund reason',
        { refundId: 'RFD_123', approvedBy: 'manager456' }
      );

      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          details: {
            amount: 5000,
            reason: 'Refund reason',
            refundId: 'RFD_123',
            approvedBy: 'manager456',
          },
        })
      );
    });

    it('should handle errors gracefully', async () => {
      AuditLog.create.mockRejectedValue(new Error('Database error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await SecurityLogger.logRefundOperation(
        'TXN_123',
        'admin123',
        5000,
        'Refund reason'
      );

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('logPaymentSuccess', () => {
    it('should log payment success', async () => {
      const mockAuditLog = { _id: 'log123' };
      AuditLog.create.mockResolvedValue(mockAuditLog);

      const result = await SecurityLogger.logPaymentSuccess(
        'TXN_123',
        'user123',
        { amount: 1000, method: 'credit_card' }
      );

      expect(AuditLog.create).toHaveBeenCalledWith({
        event: 'payment_success',
        transactionId: 'TXN_123',
        userId: 'user123',
        details: { amount: 1000, method: 'credit_card' },
        severity: 'info',
        timestamp: expect.any(Date),
      });

      expect(result).toEqual(mockAuditLog);
    });

    it('should mask sensitive data in payment details', async () => {
      AuditLog.create.mockResolvedValue({});

      await SecurityLogger.logPaymentSuccess(
        'TXN_123',
        'user123',
        { cardNumber: '1234567890123456', cvv: '123' }
      );

      const callArgs = AuditLog.create.mock.calls[0][0];
      expect(callArgs.details.cardNumber).toBe('****3456');
      expect(callArgs.details.cvv).toBeUndefined();
    });
  });

  describe('logPaymentFailure', () => {
    it('should log payment failure with error details', async () => {
      const mockAuditLog = { _id: 'log123' };
      AuditLog.create.mockResolvedValue(mockAuditLog);

      const result = await SecurityLogger.logPaymentFailure(
        'TXN_123',
        'user123',
        'INSUFFICIENT_FUNDS',
        'Insufficient funds in account'
      );

      expect(AuditLog.create).toHaveBeenCalledWith({
        event: 'payment_failure',
        transactionId: 'TXN_123',
        userId: 'user123',
        details: {
          errorCode: 'INSUFFICIENT_FUNDS',
          errorMessage: 'Insufficient funds in account',
        },
        severity: 'warning',
        timestamp: expect.any(Date),
      });

      expect(result).toEqual(mockAuditLog);
    });

    it('should include and mask additional details', async () => {
      AuditLog.create.mockResolvedValue({});

      await SecurityLogger.logPaymentFailure(
        'TXN_123',
        'user123',
        'CARD_DECLINED',
        'Card declined',
        { cardNumber: '1234567890123456', attemptCount: 2 }
      );

      const callArgs = AuditLog.create.mock.calls[0][0];
      expect(callArgs.details.cardNumber).toBe('****3456');
      expect(callArgs.details.attemptCount).toBe(2);
    });
  });

  describe('getTransactionLogs', () => {
    it('should retrieve logs for a transaction', async () => {
      const mockLogs = [
        { event: 'payment_attempt', timestamp: new Date() },
        { event: 'payment_success', timestamp: new Date() },
      ];

      AuditLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockLogs),
        }),
      });

      const result = await SecurityLogger.getTransactionLogs('TXN_123');

      expect(AuditLog.find).toHaveBeenCalledWith({ transactionId: 'TXN_123' });
      expect(result).toEqual(mockLogs);
    });

    it('should return empty array on error', async () => {
      AuditLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await SecurityLogger.getTransactionLogs('TXN_123');

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getUserLogs', () => {
    it('should retrieve logs for a user with pagination', async () => {
      const mockLogs = [{ event: 'payment_attempt' }];

      AuditLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockLogs),
            }),
          }),
        }),
      });

      AuditLog.countDocuments.mockResolvedValue(100);

      const result = await SecurityLogger.getUserLogs('user123', {
        limit: 10,
        skip: 0,
      });

      expect(result).toEqual({
        logs: mockLogs,
        pagination: {
          total: 100,
          limit: 10,
          skip: 0,
          hasMore: true,
        },
      });
    });

    it('should filter by date range', async () => {
      AuditLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      AuditLog.countDocuments.mockResolvedValue(0);

      await SecurityLogger.getUserLogs('user123', {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(AuditLog.find).toHaveBeenCalledWith({
        userId: 'user123',
        timestamp: {
          $gte: new Date('2024-01-01'),
          $lte: new Date('2024-01-31'),
        },
      });
    });
  });

  describe('getSecurityAlerts', () => {
    it('should retrieve security alerts with filters', async () => {
      const mockAlerts = [{ event: 'signature_verification_failed' }];

      SecurityAlert.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockAlerts),
              }),
            }),
          }),
        }),
      });

      SecurityAlert.countDocuments.mockResolvedValue(5);

      const result = await SecurityLogger.getSecurityAlerts(
        { severity: 'high', status: 'open' },
        { limit: 10, skip: 0 }
      );

      expect(SecurityAlert.find).toHaveBeenCalledWith({
        severity: 'high',
        status: 'open',
      });

      expect(result).toEqual({
        alerts: mockAlerts,
        pagination: {
          total: 5,
          limit: 10,
          skip: 0,
          hasMore: true, // skip (0) + alerts.length (1) < total (5) = true
        },
      });
    });
  });
});
