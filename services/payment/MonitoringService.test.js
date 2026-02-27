const MonitoringService = require('./MonitoringService');
const Transaction = require('../../models/payment/Transaction');

// Mock the Transaction model
jest.mock('../../models/payment/Transaction');

/**
 * Unit Tests for MonitoringService
 * 
 * Tests metric calculation accuracy, alert triggering thresholds, and health check logic.
 * 
 * Requirements: 16.4, 16.5
 */
describe('MonitoringService', () => {
  let service;

  beforeEach(() => {
    // Get fresh instance for each test
    service = MonitoringService;
    
    // Clear metrics before each test
    service.metrics = {
      paymentAttempts: [],
      apiResponseTimes: []
    };
    
    // Reset thresholds to defaults
    service.thresholds = {
      successRate: 90,
      apiResponseTime: 5000
    };
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Suppress console logs during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ============================================================================
  // Metric Calculation Accuracy Tests
  // ============================================================================

  describe('trackPaymentAttempt', () => {
    it('should track payment attempt with correct data structure', () => {
      const transactionId = 'TXN_1234567890';
      const status = 'success';
      const metadata = {
        paymentMethod: 'credit_card',
        errorCode: null,
        errorMessage: null
      };

      service.trackPaymentAttempt(transactionId, status, metadata);

      expect(service.metrics.paymentAttempts).toHaveLength(1);
      expect(service.metrics.paymentAttempts[0]).toMatchObject({
        transactionId,
        status,
        paymentMethod: 'credit_card',
        errorCode: null,
        errorMessage: null,
        errorCategory: null
      });
      expect(service.metrics.paymentAttempts[0].timestamp).toBeInstanceOf(Date);
    });

    it('should track payment attempt with default metadata', () => {
      const transactionId = 'TXN_1234567890';
      const status = 'failed';

      service.trackPaymentAttempt(transactionId, status);

      expect(service.metrics.paymentAttempts).toHaveLength(1);
      expect(service.metrics.paymentAttempts[0]).toMatchObject({
        transactionId,
        status,
        paymentMethod: 'unknown',
        errorCode: null,
        errorMessage: null,
        errorCategory: null
      });
    });

    it('should track multiple payment attempts', () => {
      service.trackPaymentAttempt('TXN_001', 'success', { paymentMethod: 'credit_card' });
      service.trackPaymentAttempt('TXN_002', 'failed', { paymentMethod: 'upi', errorCategory: 'network' });
      service.trackPaymentAttempt('TXN_003', 'success', { paymentMethod: 'debit_card' });

      expect(service.metrics.paymentAttempts).toHaveLength(3);
      expect(service.metrics.paymentAttempts[0].transactionId).toBe('TXN_001');
      expect(service.metrics.paymentAttempts[1].transactionId).toBe('TXN_002');
      expect(service.metrics.paymentAttempts[2].transactionId).toBe('TXN_003');
    });

    it('should limit stored attempts to 10000 entries', () => {
      // Add 10001 attempts
      for (let i = 0; i < 10001; i++) {
        service.trackPaymentAttempt(`TXN_${i}`, 'success');
      }

      // Should only keep last 10000
      expect(service.metrics.paymentAttempts).toHaveLength(10000);
      // First entry should be TXN_1 (TXN_0 was removed)
      expect(service.metrics.paymentAttempts[0].transactionId).toBe('TXN_1');
      // Last entry should be TXN_10000
      expect(service.metrics.paymentAttempts[9999].transactionId).toBe('TXN_10000');
    });

    it('should track error details for failed payments', () => {
      const metadata = {
        paymentMethod: 'credit_card',
        errorCode: 'INSUFFICIENT_FUNDS',
        errorMessage: 'Card has insufficient balance',
        errorCategory: 'insufficient_funds'
      };

      service.trackPaymentAttempt('TXN_FAILED', 'failed', metadata);

      expect(service.metrics.paymentAttempts[0]).toMatchObject({
        transactionId: 'TXN_FAILED',
        status: 'failed',
        errorCode: 'INSUFFICIENT_FUNDS',
        errorMessage: 'Card has insufficient balance',
        errorCategory: 'insufficient_funds'
      });
    });
  });

  describe('trackAPIResponseTime', () => {
    it('should track API response time with correct data structure', () => {
      const endpoint = 'createPaymentRequest';
      const duration = 250;

      service.trackAPIResponseTime(endpoint, duration);

      expect(service.metrics.apiResponseTimes).toHaveLength(1);
      expect(service.metrics.apiResponseTimes[0]).toMatchObject({
        endpoint,
        duration
      });
      expect(service.metrics.apiResponseTimes[0].timestamp).toBeInstanceOf(Date);
    });

    it('should track multiple API response times', () => {
      service.trackAPIResponseTime('createPaymentRequest', 250);
      service.trackAPIResponseTime('verifyCallback', 150);
      service.trackAPIResponseTime('queryTransactionStatus', 300);

      expect(service.metrics.apiResponseTimes).toHaveLength(3);
      expect(service.metrics.apiResponseTimes[0].endpoint).toBe('createPaymentRequest');
      expect(service.metrics.apiResponseTimes[1].endpoint).toBe('verifyCallback');
      expect(service.metrics.apiResponseTimes[2].endpoint).toBe('queryTransactionStatus');
    });

    it('should limit stored response times to 10000 entries', () => {
      // Add 10001 response times
      for (let i = 0; i < 10001; i++) {
        service.trackAPIResponseTime('endpoint', 100);
      }

      // Should only keep last 10000
      expect(service.metrics.apiResponseTimes).toHaveLength(10000);
    });

    it('should log warning for slow API responses exceeding threshold', () => {
      const slowDuration = 6000; // Exceeds 5000ms threshold

      service.trackAPIResponseTime('slowEndpoint', slowDuration);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('ALERT: Slow API response detected')
      );
    });

    it('should not log warning for fast API responses', () => {
      const fastDuration = 250; // Below 5000ms threshold

      service.trackAPIResponseTime('fastEndpoint', fastDuration);

      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentMetrics', () => {
    beforeEach(() => {
      // Mock Transaction.find to return test data
      const mockTransactions = [
        {
          status: 'success',
          initiatedAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
          completedAt: new Date(Date.now() - 1000 * 60 * 58), // 58 minutes ago (2 min processing)
          paymentMethod: 'credit_card',
          errorCategory: null
        },
        {
          status: 'success',
          initiatedAt: new Date(Date.now() - 1000 * 60 * 120), // 2 hours ago
          completedAt: new Date(Date.now() - 1000 * 60 * 117), // 117 minutes ago (3 min processing)
          paymentMethod: 'upi',
          errorCategory: null
        },
        {
          status: 'failed',
          initiatedAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
          completedAt: new Date(Date.now() - 1000 * 60 * 29), // 29 minutes ago
          paymentMethod: 'debit_card',
          errorCategory: 'insufficient_funds'
        },
        {
          status: 'failed',
          initiatedAt: new Date(Date.now() - 1000 * 60 * 45), // 45 minutes ago
          completedAt: new Date(Date.now() - 1000 * 60 * 44), // 44 minutes ago
          paymentMethod: 'net_banking',
          errorCategory: 'network'
        }
      ];

      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockTransactions)
      });
    });

    it('should calculate success rate correctly', async () => {
      const metrics = await service.getPaymentMetrics('24h');

      expect(metrics.totalAttempts).toBe(4);
      expect(metrics.successfulPayments).toBe(2);
      expect(metrics.failedPayments).toBe(2);
      expect(metrics.successRate).toBe(50.00);
    });

    it('should calculate average processing time correctly', async () => {
      const metrics = await service.getPaymentMetrics('24h');

      // Transaction 1: 2 minutes = 120 seconds
      // Transaction 2: 3 minutes = 180 seconds
      // Transaction 3 and 4 also have completion times (1 minute each)
      // Average should be calculated from all completed transactions
      expect(metrics.avgProcessingTime).toBeGreaterThan(0);
      expect(metrics.avgProcessingTime).toBeLessThan(200);
    });

    it('should calculate failure distribution by category', async () => {
      const metrics = await service.getPaymentMetrics('24h');

      expect(metrics.failureDistribution).toEqual({
        insufficient_funds: 1,
        network: 1
      });
    });

    it('should calculate payment method distribution', async () => {
      const metrics = await service.getPaymentMetrics('24h');

      expect(metrics.paymentMethodDistribution).toEqual({
        credit_card: 1,
        upi: 1,
        debit_card: 1,
        net_banking: 1
      });
    });

    it('should return failure reasons sorted by count', async () => {
      const metrics = await service.getPaymentMetrics('24h');

      expect(metrics.failureReasons).toHaveLength(2);
      expect(metrics.failureReasons[0]).toMatchObject({
        category: expect.any(String),
        count: 1,
        percentage: 25.00
      });
    });

    it('should handle empty transaction list', async () => {
      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      const metrics = await service.getPaymentMetrics('24h');

      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.successfulPayments).toBe(0);
      expect(metrics.failedPayments).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.avgProcessingTime).toBe(0);
    });

    it('should handle transactions without completion time', async () => {
      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            status: 'pending',
            initiatedAt: new Date(),
            completedAt: null,
            paymentMethod: 'credit_card',
            errorCategory: null
          }
        ])
      });

      const metrics = await service.getPaymentMetrics('24h');

      expect(metrics.avgProcessingTime).toBe(0);
    });

    it('should query correct time range for 24h', async () => {
      await service.getPaymentMetrics('24h');

      expect(Transaction.find).toHaveBeenCalledWith({
        initiatedAt: { $gte: expect.any(Date) }
      });

      const callArgs = Transaction.find.mock.calls[0][0];
      const timeDiff = Date.now() - callArgs.initiatedAt.$gte.getTime();
      expect(timeDiff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000); // Allow 1s tolerance
      expect(timeDiff).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
    });

    it('should query correct time range for 7d', async () => {
      await service.getPaymentMetrics('7d');

      const callArgs = Transaction.find.mock.calls[0][0];
      const timeDiff = Date.now() - callArgs.initiatedAt.$gte.getTime();
      expect(timeDiff).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
      expect(timeDiff).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 1000);
    });

    it('should query correct time range for 30d', async () => {
      await service.getPaymentMetrics('30d');

      const callArgs = Transaction.find.mock.calls[0][0];
      const timeDiff = Date.now() - callArgs.initiatedAt.$gte.getTime();
      expect(timeDiff).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1000);
      expect(timeDiff).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 1000);
    });

    it('should default to 24h for invalid time range', async () => {
      await service.getPaymentMetrics('invalid');

      const callArgs = Transaction.find.mock.calls[0][0];
      const timeDiff = Date.now() - callArgs.initiatedAt.$gte.getTime();
      expect(timeDiff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
      expect(timeDiff).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
    });
  });

  // ============================================================================
  // Alert Triggering Threshold Tests
  // ============================================================================

  describe('checkSystemHealth - Alert Thresholds', () => {
    beforeEach(() => {
      // Mock database connectivity check
      Transaction.countDocuments.mockReturnValue({
        limit: jest.fn().mockResolvedValue(1)
      });
    });

    it('should trigger alert when success rate drops below 90%', async () => {
      // Mock metrics with 85% success rate (below threshold)
      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'failed', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi', errorCategory: 'network' },
          { status: 'failed', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card', errorCategory: 'card_declined' },
          { status: 'failed', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking', errorCategory: 'network' }
        ])
      });

      const health = await service.checkSystemHealth();

      expect(health.checks.successRate.status).toBe('fail');
      expect(health.checks.successRate.value).toBe(85.00);
      expect(health.checks.successRate.message).toContain('ALERT');
      expect(health.checks.successRate.message).toContain('below threshold');
      expect(health.status).toBe('degraded');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('SYSTEM HEALTH ALERT'),
        expect.anything()
      );
    });

    it('should pass when success rate is at threshold (90%)', async () => {
      // Mock metrics with exactly 90% success rate
      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'failed', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi', errorCategory: 'network' }
        ])
      });

      const health = await service.checkSystemHealth();

      expect(health.checks.successRate.status).toBe('pass');
      expect(health.checks.successRate.value).toBe(90.00);
      expect(health.checks.successRate.message).toContain('within acceptable range');
    });

    it('should pass when success rate is above threshold', async () => {
      // Mock metrics with 95% success rate
      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi' },
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card' },
          { status: 'failed', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'net_banking', errorCategory: 'network' }
        ])
      });

      const health = await service.checkSystemHealth();

      expect(health.checks.successRate.status).toBe('pass');
      expect(health.checks.successRate.value).toBe(95.00);
      expect(health.status).toBe('healthy');
    });

    it('should trigger alert when API response time exceeds 5 seconds', async () => {
      // Mock successful transactions
      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' }
        ])
      });

      // Add slow API response times (average > 5000ms)
      for (let i = 0; i < 100; i++) {
        service.trackAPIResponseTime('slowEndpoint', 6000);
      }

      const health = await service.checkSystemHealth();

      expect(health.checks.apiResponseTime.status).toBe('fail');
      expect(health.checks.apiResponseTime.value).toBe(6000.00);
      expect(health.checks.apiResponseTime.message).toContain('ALERT');
      expect(health.checks.apiResponseTime.message).toContain('exceeds threshold');
      expect(health.status).toBe('degraded');
    });

    it('should pass when API response time is at threshold (5000ms)', async () => {
      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' }
        ])
      });

      // Add API response times at exactly 5000ms
      for (let i = 0; i < 100; i++) {
        service.trackAPIResponseTime('endpoint', 5000);
      }

      const health = await service.checkSystemHealth();

      expect(health.checks.apiResponseTime.status).toBe('pass');
      expect(health.checks.apiResponseTime.value).toBe(5000.00);
      expect(health.checks.apiResponseTime.message).toContain('within acceptable range');
    });

    it('should pass when API response time is below threshold', async () => {
      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' }
        ])
      });

      // Add fast API response times
      for (let i = 0; i < 100; i++) {
        service.trackAPIResponseTime('fastEndpoint', 250);
      }

      const health = await service.checkSystemHealth();

      expect(health.checks.apiResponseTime.status).toBe('pass');
      expect(health.checks.apiResponseTime.value).toBe(250.00);
      expect(health.status).toBe('healthy');
    });

    it('should handle multiple failed checks and set status to degraded', async () => {
      // Mock low success rate
      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' },
          { status: 'failed', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'upi', errorCategory: 'network' },
          { status: 'failed', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'debit_card', errorCategory: 'card_declined' }
        ])
      });

      // Add slow API response times
      for (let i = 0; i < 100; i++) {
        service.trackAPIResponseTime('slowEndpoint', 7000);
      }

      const health = await service.checkSystemHealth();

      expect(health.checks.successRate.status).toBe('fail');
      expect(health.checks.apiResponseTime.status).toBe('fail');
      expect(health.status).toBe('degraded');
      expect(console.warn).toHaveBeenCalled();
    });

    it('should calculate average API response time from last 100 calls', async () => {
      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' }
        ])
      });

      // Add 150 API calls with different response times
      for (let i = 0; i < 50; i++) {
        service.trackAPIResponseTime('endpoint', 1000); // Old calls
      }
      for (let i = 0; i < 100; i++) {
        service.trackAPIResponseTime('endpoint', 3000); // Recent 100 calls
      }

      const health = await service.checkSystemHealth();

      // Should only consider last 100 calls (all 3000ms)
      expect(health.checks.apiResponseTime.value).toBe(3000.00);
    });

    it('should handle no API response time data', async () => {
      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' }
        ])
      });

      // No API response times tracked
      service.metrics.apiResponseTimes = [];

      const health = await service.checkSystemHealth();

      expect(health.checks.apiResponseTime.value).toBe(0);
      expect(health.checks.apiResponseTime.status).toBe('pass');
    });
  });

  // ============================================================================
  // Health Check Logic Tests
  // ============================================================================

  describe('checkSystemHealth - Health Check Logic', () => {
    beforeEach(() => {
      Transaction.countDocuments.mockReturnValue({
        limit: jest.fn().mockResolvedValue(1)
      });

      Transaction.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { status: 'success', initiatedAt: new Date(), completedAt: new Date(), paymentMethod: 'credit_card' }
        ])
      });
    });

    it('should return healthy status when all checks pass', async () => {
      // Add some fast API response times
      for (let i = 0; i < 10; i++) {
        service.trackAPIResponseTime('endpoint', 250);
      }

      const health = await service.checkSystemHealth();

      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeInstanceOf(Date);
      expect(health.checks).toHaveProperty('database');
      expect(health.checks).toHaveProperty('successRate');
      expect(health.checks).toHaveProperty('apiResponseTime');
      expect(health.checks).toHaveProperty('gateway');
    });

    it('should check database connectivity', async () => {
      const health = await service.checkSystemHealth();

      expect(Transaction.countDocuments).toHaveBeenCalled();
      expect(health.checks.database.status).toBe('pass');
      expect(health.checks.database.message).toContain('Database is connected');
    });

    it('should handle database connectivity failure', async () => {
      Transaction.countDocuments.mockReturnValue({
        limit: jest.fn().mockRejectedValue(new Error('Connection timeout'))
      });

      const health = await service.checkSystemHealth();

      expect(health.checks.database.status).toBe('fail');
      expect(health.checks.database.message).toContain('Database connectivity issue');
      expect(health.status).toBe('degraded');
    });

    it('should check gateway connectivity based on recent API calls', async () => {
      // Add recent API calls with normal response times
      for (let i = 0; i < 10; i++) {
        service.trackAPIResponseTime('gateway', 300);
      }

      const health = await service.checkSystemHealth();

      expect(health.checks.gateway.status).toBe('pass');
      expect(health.checks.gateway.message).toContain('Gateway is connected');
    });

    it('should detect slow gateway when response times are very high', async () => {
      // Add recent API calls with very slow response times (> 10000ms = 2x threshold)
      for (let i = 0; i < 10; i++) {
        service.trackAPIResponseTime('gateway', 12000);
      }

      const health = await service.checkSystemHealth();

      expect(health.checks.gateway.status).toBe('fail');
      expect(health.checks.gateway.message).toContain('slow or unresponsive');
    });

    it('should return unknown gateway status when no recent API calls', async () => {
      // No API calls tracked
      service.metrics.apiResponseTimes = [];

      const health = await service.checkSystemHealth();

      expect(health.checks.gateway.status).toBe('unknown');
      expect(health.checks.gateway.message).toContain('No recent API calls');
    });

    it('should handle database connectivity failure gracefully', async () => {
      Transaction.countDocuments.mockReturnValue({
        limit: jest.fn().mockRejectedValue(new Error('Connection timeout'))
      });

      const health = await service.checkSystemHealth();

      expect(health.checks.database.status).toBe('fail');
      expect(health.checks.database.message).toContain('Database connectivity issue');
      expect(health.status).toBe('degraded');
    });

    it('should include timestamp in health check result', async () => {
      const beforeCheck = new Date();
      const health = await service.checkSystemHealth();
      const afterCheck = new Date();

      expect(health.timestamp).toBeInstanceOf(Date);
      expect(health.timestamp.getTime()).toBeGreaterThanOrEqual(beforeCheck.getTime());
      expect(health.timestamp.getTime()).toBeLessThanOrEqual(afterCheck.getTime());
    });

    it('should include all check results in health response', async () => {
      const health = await service.checkSystemHealth();

      expect(health.checks.database).toMatchObject({
        status: expect.stringMatching(/pass|fail/),
        message: expect.any(String)
      });

      expect(health.checks.successRate).toMatchObject({
        status: expect.stringMatching(/pass|fail/),
        value: expect.any(Number),
        threshold: 90,
        message: expect.any(String)
      });

      expect(health.checks.apiResponseTime).toMatchObject({
        status: expect.stringMatching(/pass|fail/),
        value: expect.any(Number),
        threshold: 5000,
        message: expect.any(String)
      });

      expect(health.checks.gateway).toMatchObject({
        status: expect.stringMatching(/pass|fail|unknown/),
        message: expect.any(String)
      });
    });
  });

  // ============================================================================
  // Additional Utility Method Tests
  // ============================================================================

  describe('clearOldMetrics', () => {
    it('should clear metrics older than 24 hours', () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Add old and recent metrics
      service.metrics.paymentAttempts = [
        { transactionId: 'OLD', timestamp: twoDaysAgo },
        { transactionId: 'RECENT', timestamp: oneHourAgo }
      ];

      service.metrics.apiResponseTimes = [
        { endpoint: 'old', timestamp: twoDaysAgo },
        { endpoint: 'recent', timestamp: oneHourAgo }
      ];

      service.clearOldMetrics();

      expect(service.metrics.paymentAttempts).toHaveLength(1);
      expect(service.metrics.paymentAttempts[0].transactionId).toBe('RECENT');

      expect(service.metrics.apiResponseTimes).toHaveLength(1);
      expect(service.metrics.apiResponseTimes[0].endpoint).toBe('recent');
    });

    it('should keep all metrics if all are recent', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      service.metrics.paymentAttempts = [
        { transactionId: 'TXN1', timestamp: oneHourAgo },
        { transactionId: 'TXN2', timestamp: oneHourAgo }
      ];

      service.clearOldMetrics();

      expect(service.metrics.paymentAttempts).toHaveLength(2);
    });

    it('should clear all metrics if all are old', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      service.metrics.paymentAttempts = [
        { transactionId: 'OLD1', timestamp: twoDaysAgo },
        { transactionId: 'OLD2', timestamp: twoDaysAgo }
      ];

      service.clearOldMetrics();

      expect(service.metrics.paymentAttempts).toHaveLength(0);
    });
  });

  describe('logAPIError', () => {
    it('should log API error with correct details', () => {
      const endpoint = 'createPaymentRequest';
      const errorCode = 'GATEWAY_TIMEOUT';
      const errorMessage = 'Gateway did not respond within timeout period';

      service.logAPIError(endpoint, errorCode, errorMessage);

      expect(console.error).toHaveBeenCalledWith(
        '[MonitoringService] API Error:',
        expect.objectContaining({
          endpoint,
          errorCode,
          errorMessage,
          timestamp: expect.any(Date)
        })
      );
    });

    it('should include timestamp in error log', () => {
      const beforeLog = new Date();
      service.logAPIError('endpoint', 'ERROR_CODE', 'Error message');
      const afterLog = new Date();

      const logCall = console.error.mock.calls[0][1];
      expect(logCall.timestamp).toBeInstanceOf(Date);
      expect(logCall.timestamp.getTime()).toBeGreaterThanOrEqual(beforeLog.getTime());
      expect(logCall.timestamp.getTime()).toBeLessThanOrEqual(afterLog.getTime());
    });
  });

  describe('getRecentTransactions', () => {
    it('should fetch recent transactions with correct limit', async () => {
      const mockTransactions = [
        {
          transactionId: 'TXN_001',
          status: 'success',
          finalAmount: { toString: () => '10000.00' },
          finalAmountFormatted: '10000.00',
          paymentMethod: 'credit_card',
          initiatedAt: new Date(),
          completedAt: new Date(),
          student: { name: 'John Doe', email: 'john@example.com' },
          course: { title: 'Full Stack Development' }
        }
      ];

      Transaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockTransactions)
      });

      const transactions = await service.getRecentTransactions(50);

      expect(Transaction.find).toHaveBeenCalled();
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        transactionId: 'TXN_001',
        status: 'success',
        amount: '10000.00',
        paymentMethod: 'credit_card'
      });
    });

    it('should use default limit of 50 when not specified', async () => {
      Transaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([])
      });

      await service.getRecentTransactions();

      const mockChain = Transaction.find();
      expect(mockChain.limit).toHaveBeenCalledWith(50);
    });

    it('should handle errors when fetching transactions', async () => {
      Transaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      await expect(service.getRecentTransactions()).rejects.toThrow('Database error');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching recent transactions'),
        expect.any(Error)
      );
    });
  });
});
