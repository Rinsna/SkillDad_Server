const ReconciliationService = require('./ReconciliationService');
const Transaction = require('../../models/payment/Transaction');
const Reconciliation = require('../../models/payment/Reconciliation');
const HDFCGatewayService = require('./HDFCGatewayService');
const mongoose = require('mongoose');

// Mock dependencies
jest.mock('../../models/payment/Transaction');
jest.mock('../../models/payment/Reconciliation');
jest.mock('./HDFCGatewayService');

/**
 * Unit Tests for ReconciliationService
 * 
 * Tests transaction matching logic, discrepancy detection for all types,
 * and summary calculation accuracy.
 * 
 * Requirements: 10.3, 10.4, 10.5
 */
describe('ReconciliationService', () => {
  let service;
  let mockGatewayService;

  beforeEach(() => {
    // Create mock gateway service
    mockGatewayService = {
      merchantId: 'TEST_MERCHANT',
      apiSecret: 'test_secret',
      apiKey: 'test_key',
      gatewayUrl: 'https://test.gateway.com',
      signatureService: {
        generateSignature: jest.fn().mockReturnValue('test_signature')
      }
    };

    // Create service instance
    service = new ReconciliationService(mockGatewayService);

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
  // Transaction Matching Logic Tests
  // ============================================================================

  describe('reconcileTransactions - Transaction Matching', () => {
    it('should match transactions by transaction ID', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      // Mock local transactions
      const localTransactions = [
        {
          transactionId: 'TXN_001',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        },
        {
          transactionId: 'TXN_002',
          finalAmount: mongoose.Types.Decimal128.fromString('2000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-16')
        }
      ];

      // Mock settlement records (matching)
      const settlementRecords = [
        {
          transactionId: 'TXN_001',
          amount: 1000.00,
          status: 'success'
        },
        {
          transactionId: 'TXN_002',
          amount: 2000.00,
          status: 'success'
        }
      ];

      // Mock database calls
      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      // Mock fetchSettlementReportForRange
      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      // Mock Reconciliation model
      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      // Execute reconciliation
      const result = await service.reconcileTransactions(startDate, endDate, userId);

      // Verify matching logic
      expect(result.matchedTransactions).toBe(2);
      expect(result.unmatchedTransactions).toBe(0);
      expect(result.discrepancies).toHaveLength(0);
    });

    it('should match transactions with normalized status', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      // Mock local transactions with 'success' status
      const localTransactions = [
        {
          transactionId: 'TXN_001',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        }
      ];

      // Mock settlement records with 'completed' status (should normalize to 'success')
      const settlementRecords = [
        {
          transactionId: 'TXN_001',
          amount: 1000.00,
          status: 'completed'
        }
      ];

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      // Should match because 'success' and 'completed' normalize to the same status
      expect(result.matchedTransactions).toBe(1);
      expect(result.discrepancies).toHaveLength(0);
    });

    it('should handle multiple transactions with mixed matching results', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      const localTransactions = [
        {
          transactionId: 'TXN_001',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        },
        {
          transactionId: 'TXN_002',
          finalAmount: mongoose.Types.Decimal128.fromString('2000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-16')
        },
        {
          transactionId: 'TXN_003',
          finalAmount: mongoose.Types.Decimal128.fromString('3000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-17')
        }
      ];

      // Only TXN_001 matches perfectly
      const settlementRecords = [
        {
          transactionId: 'TXN_001',
          amount: 1000.00,
          status: 'success'
        }
      ];

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      expect(result.matchedTransactions).toBe(1);
      expect(result.unmatchedTransactions).toBe(2); // TXN_002 and TXN_003 missing in gateway
    });
  });

  // ============================================================================
  // Discrepancy Detection Tests - All Types
  // ============================================================================

  describe('reconcileTransactions - Discrepancy Detection', () => {
    it('should detect missing_in_gateway discrepancies', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      // Transaction exists in system but not in gateway
      const localTransactions = [
        {
          transactionId: 'TXN_MISSING',
          finalAmount: mongoose.Types.Decimal128.fromString('1500.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        }
      ];

      const settlementRecords = []; // Empty - transaction missing in gateway

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].type).toBe('missing_in_gateway');
      expect(result.discrepancies[0].transactionId).toBe('TXN_MISSING');
      expect(result.discrepancies[0].systemAmount).toBeDefined();
      expect(result.discrepancies[0].description).toContain('missing in gateway');
    });

    it('should detect missing_in_system discrepancies', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      const localTransactions = []; // Empty - transaction missing in system

      // Transaction exists in gateway but not in system
      const settlementRecords = [
        {
          transactionId: 'TXN_GATEWAY_ONLY',
          amount: 2500.00,
          status: 'success'
        }
      ];

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].type).toBe('missing_in_system');
      expect(result.discrepancies[0].transactionId).toBe('TXN_GATEWAY_ONLY');
      expect(result.discrepancies[0].gatewayAmount).toBeDefined();
      expect(result.discrepancies[0].description).toContain('missing in system');
    });

    it('should detect amount_mismatch discrepancies', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      // Same transaction ID but different amounts
      const localTransactions = [
        {
          transactionId: 'TXN_AMOUNT_DIFF',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        }
      ];

      const settlementRecords = [
        {
          transactionId: 'TXN_AMOUNT_DIFF',
          amount: 950.00, // Different amount
          status: 'success'
        }
      ];

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].type).toBe('amount_mismatch');
      expect(result.discrepancies[0].transactionId).toBe('TXN_AMOUNT_DIFF');
      expect(result.discrepancies[0].systemAmount).toBeDefined();
      expect(result.discrepancies[0].gatewayAmount).toBeDefined();
      expect(result.discrepancies[0].description).toContain('Amount mismatch');
    });

    it('should detect status_mismatch discrepancies', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      // Same transaction ID but different status
      const localTransactions = [
        {
          transactionId: 'TXN_STATUS_DIFF',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        }
      ];

      const settlementRecords = [
        {
          transactionId: 'TXN_STATUS_DIFF',
          amount: 1000.00,
          status: 'refunded' // Different status
        }
      ];

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].type).toBe('status_mismatch');
      expect(result.discrepancies[0].transactionId).toBe('TXN_STATUS_DIFF');
      expect(result.discrepancies[0].systemStatus).toBe('success');
      expect(result.discrepancies[0].gatewayStatus).toBe('refunded');
      expect(result.discrepancies[0].description).toContain('Status mismatch');
    });

    it('should detect multiple discrepancy types in single reconciliation', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      const localTransactions = [
        {
          transactionId: 'TXN_001',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        },
        {
          transactionId: 'TXN_002',
          finalAmount: mongoose.Types.Decimal128.fromString('2000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-16')
        },
        {
          transactionId: 'TXN_003',
          finalAmount: mongoose.Types.Decimal128.fromString('3000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-17')
        }
      ];

      const settlementRecords = [
        {
          transactionId: 'TXN_001',
          amount: 1050.00, // Amount mismatch
          status: 'success'
        },
        {
          transactionId: 'TXN_002',
          amount: 2000.00,
          status: 'refunded' // Status mismatch
        },
        {
          transactionId: 'TXN_004', // Missing in system
          amount: 4000.00,
          status: 'success'
        }
        // TXN_003 missing in gateway
      ];

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      expect(result.discrepancies).toHaveLength(4);
      
      // Check for amount mismatch
      const amountMismatch = result.discrepancies.find(d => d.type === 'amount_mismatch');
      expect(amountMismatch).toBeDefined();
      expect(amountMismatch.transactionId).toBe('TXN_001');

      // Check for status mismatch
      const statusMismatch = result.discrepancies.find(d => d.type === 'status_mismatch');
      expect(statusMismatch).toBeDefined();
      expect(statusMismatch.transactionId).toBe('TXN_002');

      // Check for missing in gateway
      const missingInGateway = result.discrepancies.find(d => d.type === 'missing_in_gateway');
      expect(missingInGateway).toBeDefined();
      expect(missingInGateway.transactionId).toBe('TXN_003');

      // Check for missing in system
      const missingInSystem = result.discrepancies.find(d => d.type === 'missing_in_system');
      expect(missingInSystem).toBeDefined();
      expect(missingInSystem.transactionId).toBe('TXN_004');
    });

    it('should handle amount differences within tolerance (0.01)', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      // Amount difference of 0.01 should be tolerated (rounding)
      const localTransactions = [
        {
          transactionId: 'TXN_ROUNDING',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        }
      ];

      const settlementRecords = [
        {
          transactionId: 'TXN_ROUNDING',
          amount: 1000.01, // Within tolerance
          status: 'success'
        }
      ];

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      // Should match because difference is within tolerance
      expect(result.matchedTransactions).toBe(1);
      expect(result.discrepancies).toHaveLength(0);
    });
  });

  // ============================================================================
  // Summary Calculation Accuracy Tests
  // ============================================================================

  describe('reconcileTransactions - Summary Calculations', () => {
    it('should calculate total amount correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      const localTransactions = [
        {
          transactionId: 'TXN_001',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        },
        {
          transactionId: 'TXN_002',
          finalAmount: mongoose.Types.Decimal128.fromString('2500.50'),
          status: 'success',
          initiatedAt: new Date('2024-01-16')
        },
        {
          transactionId: 'TXN_003',
          finalAmount: mongoose.Types.Decimal128.fromString('750.25'),
          status: 'success',
          initiatedAt: new Date('2024-01-17')
        }
      ];

      const settlementRecords = localTransactions.map(txn => ({
        transactionId: txn.transactionId,
        amount: parseFloat(txn.finalAmount.toString()),
        status: 'success'
      }));

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      // Total: 1000.00 + 2500.50 + 750.25 = 4250.75
      const totalAmount = parseFloat(result.totalAmount.toString());
      expect(totalAmount).toBeCloseTo(4250.75, 2);
    });

    it('should calculate settled amount correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      const localTransactions = [
        {
          transactionId: 'TXN_001',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        },
        {
          transactionId: 'TXN_002',
          finalAmount: mongoose.Types.Decimal128.fromString('2000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-16')
        },
        {
          transactionId: 'TXN_003',
          finalAmount: mongoose.Types.Decimal128.fromString('500.00'),
          refundAmount: mongoose.Types.Decimal128.fromString('500.00'),
          status: 'refunded',
          initiatedAt: new Date('2024-01-17')
        }
      ];

      const settlementRecords = localTransactions.map(txn => ({
        transactionId: txn.transactionId,
        amount: parseFloat(txn.finalAmount.toString()),
        status: txn.status
      }));

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      // Settled: 1000.00 + 2000.00 = 3000.00 (excluding refunded)
      const settledAmount = parseFloat(result.settledAmount.toString());
      expect(settledAmount).toBeCloseTo(3000.00, 2);
    });

    it('should calculate refunded amount correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      const localTransactions = [
        {
          transactionId: 'TXN_001',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        },
        {
          transactionId: 'TXN_002',
          finalAmount: mongoose.Types.Decimal128.fromString('2000.00'),
          refundAmount: mongoose.Types.Decimal128.fromString('2000.00'),
          status: 'refunded',
          initiatedAt: new Date('2024-01-16')
        },
        {
          transactionId: 'TXN_003',
          finalAmount: mongoose.Types.Decimal128.fromString('1500.00'),
          refundAmount: mongoose.Types.Decimal128.fromString('750.00'),
          status: 'partial_refund',
          initiatedAt: new Date('2024-01-17')
        }
      ];

      const settlementRecords = localTransactions.map(txn => ({
        transactionId: txn.transactionId,
        amount: parseFloat(txn.finalAmount.toString()),
        status: txn.status
      }));

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      // Refunded: 2000.00 + 750.00 = 2750.00
      const refundedAmount = parseFloat(result.refundedAmount.toString());
      expect(refundedAmount).toBeCloseTo(2750.00, 2);
    });

    it('should calculate net settlement correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      const localTransactions = [
        {
          transactionId: 'TXN_001',
          finalAmount: mongoose.Types.Decimal128.fromString('5000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        },
        {
          transactionId: 'TXN_002',
          finalAmount: mongoose.Types.Decimal128.fromString('3000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-16')
        },
        {
          transactionId: 'TXN_003',
          finalAmount: mongoose.Types.Decimal128.fromString('2000.00'),
          refundAmount: mongoose.Types.Decimal128.fromString('2000.00'),
          status: 'refunded',
          initiatedAt: new Date('2024-01-17')
        }
      ];

      const settlementRecords = localTransactions.map(txn => ({
        transactionId: txn.transactionId,
        amount: parseFloat(txn.finalAmount.toString()),
        status: txn.status
      }));

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      // Net: (5000 + 3000) - 2000 = 6000.00
      const netSettlement = parseFloat(result.netSettlementAmount.toString());
      expect(netSettlement).toBeCloseTo(6000.00, 2);
    });

    it('should count transaction types correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      const localTransactions = [
        {
          transactionId: 'TXN_001',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        },
        {
          transactionId: 'TXN_002',
          finalAmount: mongoose.Types.Decimal128.fromString('2000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-16')
        },
        {
          transactionId: 'TXN_003',
          finalAmount: mongoose.Types.Decimal128.fromString('3000.00'),
          status: 'success',
          initiatedAt: new Date('2024-01-17')
        },
        {
          transactionId: 'TXN_004',
          finalAmount: mongoose.Types.Decimal128.fromString('1500.00'),
          refundAmount: mongoose.Types.Decimal128.fromString('1500.00'),
          status: 'refunded',
          initiatedAt: new Date('2024-01-18')
        },
        {
          transactionId: 'TXN_005',
          finalAmount: mongoose.Types.Decimal128.fromString('2500.00'),
          refundAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'partial_refund',
          initiatedAt: new Date('2024-01-19')
        }
      ];

      const settlementRecords = localTransactions.map(txn => ({
        transactionId: txn.transactionId,
        amount: parseFloat(txn.finalAmount.toString()),
        status: txn.status
      }));

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      expect(result.totalTransactions).toBe(5);
      expect(result.successfulTransactions).toBe(3);
      expect(result.refundedTransactions).toBe(2); // refunded + partial_refund
      expect(result.failedTransactions).toBe(0);
    });

    it('should handle empty transaction list', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue([]);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      expect(result.totalTransactions).toBe(0);
      expect(result.matchedTransactions).toBe(0);
      expect(result.unmatchedTransactions).toBe(0);
      expect(parseFloat(result.totalAmount.toString())).toBe(0);
      expect(parseFloat(result.settledAmount.toString())).toBe(0);
      expect(parseFloat(result.netSettlementAmount.toString())).toBe(0);
    });
  });

  // ============================================================================
  // Status Normalization Tests
  // ============================================================================

  describe('normalizeStatus', () => {
    it('should normalize success statuses', () => {
      expect(service.normalizeStatus('success')).toBe('success');
      expect(service.normalizeStatus('completed')).toBe('success');
      expect(service.normalizeStatus('settled')).toBe('success');
      expect(service.normalizeStatus('SUCCESS')).toBe('success');
      expect(service.normalizeStatus('COMPLETED')).toBe('success');
    });

    it('should normalize refund statuses', () => {
      expect(service.normalizeStatus('refunded')).toBe('refunded');
      expect(service.normalizeStatus('refund')).toBe('refunded');
      expect(service.normalizeStatus('partial_refund')).toBe('refunded');
      expect(service.normalizeStatus('REFUNDED')).toBe('refunded');
    });

    it('should normalize failed statuses', () => {
      expect(service.normalizeStatus('failed')).toBe('failed');
      expect(service.normalizeStatus('failure')).toBe('failed');
      expect(service.normalizeStatus('FAILED')).toBe('failed');
    });

    it('should normalize pending statuses', () => {
      expect(service.normalizeStatus('pending')).toBe('pending');
      expect(service.normalizeStatus('PENDING')).toBe('pending');
    });

    it('should return lowercase for unknown statuses', () => {
      expect(service.normalizeStatus('unknown')).toBe('unknown');
      expect(service.normalizeStatus('PROCESSING')).toBe('processing');
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('reconcileTransactions - Error Handling', () => {
    it('should mark reconciliation as failed on error', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        status: 'in_progress'
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      await expect(
        service.reconcileTransactions(startDate, endDate, userId)
      ).rejects.toThrow('Failed to reconcile transactions');

      expect(mockReconciliation.status).toBe('failed');
      expect(mockReconciliation.errorMessage).toBeDefined();
    });

    it('should handle settlement report fetch errors gracefully', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockRejectedValue(
        new Error('Gateway unavailable')
      );

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        status: 'in_progress'
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      await expect(
        service.reconcileTransactions(startDate, endDate, userId)
      ).rejects.toThrow();

      expect(mockReconciliation.status).toBe('failed');
    });
  });

  // ============================================================================
  // Edge Cases and Boundary Tests
  // ============================================================================

  describe('reconcileTransactions - Edge Cases', () => {
    it('should handle transactions with missing refundAmount field', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      const localTransactions = [
        {
          transactionId: 'TXN_001',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.00'),
          status: 'refunded',
          // refundAmount is missing
          initiatedAt: new Date('2024-01-15')
        }
      ];

      const settlementRecords = [
        {
          transactionId: 'TXN_001',
          amount: 1000.00,
          status: 'refunded'
        }
      ];

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      // Should handle missing refundAmount gracefully (default to 0)
      const refundedAmount = parseFloat(result.refundedAmount.toString());
      expect(refundedAmount).toBe(0);
    });

    it('should handle very small amount differences (precision)', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      const localTransactions = [
        {
          transactionId: 'TXN_001',
          finalAmount: mongoose.Types.Decimal128.fromString('1000.005'),
          status: 'success',
          initiatedAt: new Date('2024-01-15')
        }
      ];

      const settlementRecords = [
        {
          transactionId: 'TXN_001',
          amount: 1000.00,
          status: 'success'
        }
      ];

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const result = await service.reconcileTransactions(startDate, endDate, userId);

      // Should match because difference is within tolerance
      expect(result.matchedTransactions).toBe(1);
    });

    it('should handle large number of transactions efficiently', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const userId = 'user123';

      // Generate 1000 transactions
      const localTransactions = Array.from({ length: 1000 }, (_, i) => ({
        transactionId: `TXN_${String(i).padStart(4, '0')}`,
        finalAmount: mongoose.Types.Decimal128.fromString('100.00'),
        status: 'success',
        initiatedAt: new Date('2024-01-15')
      }));

      const settlementRecords = localTransactions.map(txn => ({
        transactionId: txn.transactionId,
        amount: 100.00,
        status: 'success'
      }));

      Transaction.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(localTransactions)
      });

      jest.spyOn(service, 'fetchSettlementReportForRange').mockResolvedValue(settlementRecords);

      const mockReconciliation = {
        save: jest.fn().mockResolvedValue(true),
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        discrepancies: []
      };
      Reconciliation.mockImplementation(() => mockReconciliation);

      const startTime = Date.now();
      const result = await service.reconcileTransactions(startDate, endDate, userId);
      const duration = Date.now() - startTime;

      expect(result.totalTransactions).toBe(1000);
      expect(result.matchedTransactions).toBe(1000);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('constructor', () => {
    it('should throw error if gatewayService is not provided', () => {
      expect(() => {
        new ReconciliationService(null);
      }).toThrow('HDFCGatewayService is required');
    });

    it('should initialize with valid gatewayService', () => {
      const service = new ReconciliationService(mockGatewayService);
      expect(service.gatewayService).toBe(mockGatewayService);
    });
  });
});
