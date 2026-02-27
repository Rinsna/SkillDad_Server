const PCIComplianceService = require('./PCIComplianceService');
const User = require('../../models/userModel');

// Mock the User model
jest.mock('../../models/userModel');

/**
 * Unit tests for PCIComplianceService
 * 
 * Tests PCI-DSS compliance validation, access control enforcement,
 * and card data masking.
 * 
 * Requirements: 14.1, 14.2, 5.9
 */
describe('PCIComplianceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateCardDataNotStored', () => {
    it('should pass validation for data without forbidden fields', () => {
      const data = {
        transactionId: 'TXN_123',
        amount: 1000,
        currency: 'INR',
        status: 'success',
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).not.toThrow();
    });

    it('should throw error if cardNumber is present', () => {
      const data = {
        cardNumber: '1234567890123456',
        amount: 1000,
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation.*cardNumber/i);
    });

    it('should throw error if cvv is present', () => {
      const data = {
        cvv: '123',
        amount: 1000,
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation.*cvv/i);
    });

    it('should throw error if cvc is present', () => {
      const data = {
        cvc: '456',
        amount: 1000,
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation.*cvc/i);
    });

    it('should throw error if pin is present', () => {
      const data = {
        pin: '1234',
        amount: 1000,
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation.*pin/i);
    });

    it('should throw error if cardPin is present', () => {
      const data = {
        cardPin: '5678',
        amount: 1000,
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation.*cardPin/i);
    });

    it('should throw error if expiryDate is present', () => {
      const data = {
        expiryDate: '12/25',
        amount: 1000,
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation.*expiryDate/i);
    });

    it('should throw error if expirationDate is present', () => {
      const data = {
        expirationDate: '12/2025',
        amount: 1000,
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation.*expirationDate/i);
    });

    it('should throw error if securityCode is present', () => {
      const data = {
        securityCode: '789',
        amount: 1000,
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation.*securityCode/i);
    });

    it('should detect forbidden fields in nested objects', () => {
      const data = {
        transaction: {
          payment: {
            cardNumber: '1234567890123456',
          },
        },
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation.*cardNumber/i);
    });

    it('should detect forbidden fields in arrays', () => {
      const data = {
        payments: [
          { amount: 1000 },
          { cvv: '123' },
        ],
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation.*cvv/i);
    });

    it('should be case-insensitive when detecting forbidden fields', () => {
      const data = {
        CardNumber: '1234567890123456',
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation/i);
    });

    it('should detect fields containing forbidden keywords', () => {
      const data = {
        userCardNumber: '1234567890123456',
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation/i);
    });

    it('should handle null data', () => {
      expect(() => {
        PCIComplianceService.validateCardDataNotStored(null);
      }).not.toThrow();
    });

    it('should handle undefined data', () => {
      expect(() => {
        PCIComplianceService.validateCardDataNotStored(undefined);
      }).not.toThrow();
    });

    it('should handle empty object', () => {
      expect(() => {
        PCIComplianceService.validateCardDataNotStored({});
      }).not.toThrow();
    });

    it('should return true when validation passes', () => {
      const data = { amount: 1000 };
      const result = PCIComplianceService.validateCardDataNotStored(data);
      expect(result).toBe(true);
    });

    it('should include path in error message for nested fields', () => {
      const data = {
        user: {
          payment: {
            cvv: '123',
          },
        },
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/user\.payment\.cvv/);
    });

    it('should detect multiple forbidden fields and throw for first one found', () => {
      const data = {
        cardNumber: '1234567890123456',
        cvv: '123',
        pin: '4567',
      };

      expect(() => {
        PCIComplianceService.validateCardDataNotStored(data);
      }).toThrow(/PCI-DSS Compliance Violation/);
    });
  });

  describe('maskCardNumber', () => {
    it('should mask card number showing only last 4 digits', () => {
      const cardNumber = '1234567890123456';
      const masked = PCIComplianceService.maskCardNumber(cardNumber);
      expect(masked).toBe('****3456');
    });

    it('should handle card numbers with spaces', () => {
      const cardNumber = '1234 5678 9012 3456';
      const masked = PCIComplianceService.maskCardNumber(cardNumber);
      expect(masked).toBe('****3456');
    });

    it('should handle card numbers with dashes', () => {
      const cardNumber = '1234-5678-9012-3456';
      const masked = PCIComplianceService.maskCardNumber(cardNumber);
      expect(masked).toBe('****3456');
    });

    it('should return **** for null card number', () => {
      const masked = PCIComplianceService.maskCardNumber(null);
      expect(masked).toBe('****');
    });

    it('should return **** for undefined card number', () => {
      const masked = PCIComplianceService.maskCardNumber(undefined);
      expect(masked).toBe('****');
    });

    it('should return **** for empty string', () => {
      const masked = PCIComplianceService.maskCardNumber('');
      expect(masked).toBe('****');
    });

    it('should return **** for invalid card number (too short)', () => {
      const masked = PCIComplianceService.maskCardNumber('1234567');
      expect(masked).toBe('****');
    });

    it('should return **** for invalid card number (too long)', () => {
      const masked = PCIComplianceService.maskCardNumber('12345678901234567890');
      expect(masked).toBe('****');
    });

    it('should return **** for non-numeric card number', () => {
      const masked = PCIComplianceService.maskCardNumber('abcd1234efgh5678');
      expect(masked).toBe('****');
    });

    it('should handle 16-digit card numbers', () => {
      const masked = PCIComplianceService.maskCardNumber('4111111111111111');
      expect(masked).toBe('****1111');
    });

    it('should handle 15-digit card numbers (Amex)', () => {
      const masked = PCIComplianceService.maskCardNumber('378282246310005');
      expect(masked).toBe('****0005');
    });

    it('should handle 13-digit card numbers', () => {
      const masked = PCIComplianceService.maskCardNumber('4222222222222');
      expect(masked).toBe('****2222');
    });

    it('should convert number to string', () => {
      const masked = PCIComplianceService.maskCardNumber(1234567890123456);
      expect(masked).toBe('****3456');
    });
  });

  describe('enforceAccessControl', () => {
    it('should allow student to initiate payment', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'student' }),
      });

      const result = await PCIComplianceService.enforceAccessControl(
        'user123',
        'initiate_payment'
      );

      expect(result).toBe(true);
    });

    it('should allow admin to process refund', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'admin' }),
      });

      const result = await PCIComplianceService.enforceAccessControl(
        'admin123',
        'process_refund'
      );

      expect(result).toBe(true);
    });

    it('should allow finance role to process refund', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'finance' }),
      });

      const result = await PCIComplianceService.enforceAccessControl(
        'finance123',
        'process_refund'
      );

      expect(result).toBe(true);
    });

    it('should deny student from processing refund', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'student' }),
      });

      await expect(
        PCIComplianceService.enforceAccessControl('user123', 'process_refund')
      ).rejects.toThrow(/Access Denied.*student.*process_refund/);
    });

    it('should deny student from viewing all transactions', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'student' }),
      });

      await expect(
        PCIComplianceService.enforceAccessControl('user123', 'view_all_transactions')
      ).rejects.toThrow(/Access Denied/);
    });

    it('should allow admin to configure gateway', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'admin' }),
      });

      const result = await PCIComplianceService.enforceAccessControl(
        'admin123',
        'configure_gateway'
      );

      expect(result).toBe(true);
    });

    it('should deny finance role from configuring gateway', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'finance' }),
      });

      await expect(
        PCIComplianceService.enforceAccessControl('finance123', 'configure_gateway')
      ).rejects.toThrow(/Access Denied/);
    });

    it('should allow finance role to run reconciliation', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'finance' }),
      });

      const result = await PCIComplianceService.enforceAccessControl(
        'finance123',
        'run_reconciliation'
      );

      expect(result).toBe(true);
    });

    it('should allow admin to view security alerts', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'admin' }),
      });

      const result = await PCIComplianceService.enforceAccessControl(
        'admin123',
        'view_security_alerts'
      );

      expect(result).toBe(true);
    });

    it('should deny finance role from viewing security alerts', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'finance' }),
      });

      await expect(
        PCIComplianceService.enforceAccessControl('finance123', 'view_security_alerts')
      ).rejects.toThrow(/Access Denied/);
    });

    it('should throw error if user ID is not provided', async () => {
      await expect(
        PCIComplianceService.enforceAccessControl(null, 'initiate_payment')
      ).rejects.toThrow('User ID is required for access control');
    });

    it('should throw error if user is not found', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(
        PCIComplianceService.enforceAccessControl('user123', 'initiate_payment')
      ).rejects.toThrow('User not found');
    });

    it('should throw error for unknown operation', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'admin' }),
      });

      await expect(
        PCIComplianceService.enforceAccessControl('admin123', 'unknown_operation')
      ).rejects.toThrow('Unknown operation: unknown_operation');
    });

    it('should include required roles in error message', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'student' }),
      });

      await expect(
        PCIComplianceService.enforceAccessControl('user123', 'process_refund')
      ).rejects.toThrow(/Required roles: admin, finance/);
    });

    it('should allow student to view own payments', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'student' }),
      });

      const result = await PCIComplianceService.enforceAccessControl(
        'user123',
        'view_own_payments'
      );

      expect(result).toBe(true);
    });

    it('should allow university role to view own payments', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'university' }),
      });

      const result = await PCIComplianceService.enforceAccessControl(
        'uni123',
        'view_own_payments'
      );

      expect(result).toBe(true);
    });

    it('should allow partner role to view own payments', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'partner' }),
      });

      const result = await PCIComplianceService.enforceAccessControl(
        'partner123',
        'view_own_payments'
      );

      expect(result).toBe(true);
    });
  });

  describe('validateTwoFactorAuth', () => {
    it('should validate 6-digit 2FA code format', async () => {
      const result = await PCIComplianceService.validateTwoFactorAuth(
        'user123',
        '123456'
      );

      expect(result).toBe(true);
    });

    it('should throw error if user ID is not provided', async () => {
      await expect(
        PCIComplianceService.validateTwoFactorAuth(null, '123456')
      ).rejects.toThrow('User ID is required for 2FA validation');
    });

    it('should throw error if 2FA code is not provided', async () => {
      await expect(
        PCIComplianceService.validateTwoFactorAuth('user123', null)
      ).rejects.toThrow('Two-factor authentication code is required');
    });

    it('should throw error for invalid 2FA code format (too short)', async () => {
      await expect(
        PCIComplianceService.validateTwoFactorAuth('user123', '12345')
      ).rejects.toThrow('Invalid 2FA code format. Expected 6-digit code.');
    });

    it('should throw error for invalid 2FA code format (too long)', async () => {
      await expect(
        PCIComplianceService.validateTwoFactorAuth('user123', '1234567')
      ).rejects.toThrow('Invalid 2FA code format. Expected 6-digit code.');
    });

    it('should throw error for non-numeric 2FA code', async () => {
      await expect(
        PCIComplianceService.validateTwoFactorAuth('user123', 'abc123')
      ).rejects.toThrow('Invalid 2FA code format. Expected 6-digit code.');
    });

    it('should throw error for 2FA code with spaces', async () => {
      await expect(
        PCIComplianceService.validateTwoFactorAuth('user123', '123 456')
      ).rejects.toThrow('Invalid 2FA code format. Expected 6-digit code.');
    });

    it('should accept valid 6-digit codes', async () => {
      const validCodes = ['000000', '123456', '999999', '654321'];

      for (const code of validCodes) {
        const result = await PCIComplianceService.validateTwoFactorAuth(
          'user123',
          code
        );
        expect(result).toBe(true);
      }
    });
  });

  describe('sanitizePaymentData', () => {
    it('should remove forbidden fields from data', () => {
      const data = {
        transactionId: 'TXN_123',
        cardNumber: '1234567890123456',
        cvv: '123',
        amount: 1000,
      };

      const sanitized = PCIComplianceService.sanitizePaymentData(data);

      expect(sanitized.transactionId).toBe('TXN_123');
      expect(sanitized.amount).toBe(1000);
      expect(sanitized.cardNumber).toBeUndefined();
      expect(sanitized.cvv).toBeUndefined();
    });

    it('should remove all forbidden fields', () => {
      const data = {
        cardNumber: '1234567890123456',
        cvv: '123',
        cvc: '456',
        pin: '1234',
        cardPin: '5678',
        expiryDate: '12/25',
        password: 'secret',
        apiKey: 'key123',
      };

      const sanitized = PCIComplianceService.sanitizePaymentData(data);

      expect(Object.keys(sanitized)).toHaveLength(0);
    });

    it('should handle nested objects', () => {
      const data = {
        transaction: {
          payment: {
            cardNumber: '1234567890123456',
            amount: 1000,
          },
        },
      };

      const sanitized = PCIComplianceService.sanitizePaymentData(data);

      expect(sanitized.transaction.payment.amount).toBe(1000);
      expect(sanitized.transaction.payment.cardNumber).toBeUndefined();
    });

    it('should handle arrays', () => {
      const data = {
        payments: [
          { cardNumber: '1111222233334444', amount: 1000 },
          { cvv: '123', amount: 2000 },
        ],
      };

      const sanitized = PCIComplianceService.sanitizePaymentData(data);

      expect(sanitized.payments[0].amount).toBe(1000);
      expect(sanitized.payments[0].cardNumber).toBeUndefined();
      expect(sanitized.payments[1].amount).toBe(2000);
      expect(sanitized.payments[1].cvv).toBeUndefined();
    });

    it('should not modify original data', () => {
      const data = {
        cardNumber: '1234567890123456',
        amount: 1000,
      };

      const original = JSON.parse(JSON.stringify(data));
      PCIComplianceService.sanitizePaymentData(data);

      expect(data).toEqual(original);
    });

    it('should handle null data', () => {
      const sanitized = PCIComplianceService.sanitizePaymentData(null);
      expect(sanitized).toBeNull();
    });

    it('should handle undefined data', () => {
      const sanitized = PCIComplianceService.sanitizePaymentData(undefined);
      expect(sanitized).toBeUndefined();
    });

    it('should handle empty object', () => {
      const sanitized = PCIComplianceService.sanitizePaymentData({});
      expect(sanitized).toEqual({});
    });
  });

  describe('validateCardLast4', () => {
    it('should validate 4-digit card last 4', () => {
      expect(() => {
        PCIComplianceService.validateCardLast4('1234');
      }).not.toThrow();
    });

    it('should return true for valid card last 4', () => {
      const result = PCIComplianceService.validateCardLast4('5678');
      expect(result).toBe(true);
    });

    it('should throw error for less than 4 digits', () => {
      expect(() => {
        PCIComplianceService.validateCardLast4('123');
      }).toThrow('Card last 4 digits must be exactly 4 numeric digits');
    });

    it('should throw error for more than 4 digits', () => {
      expect(() => {
        PCIComplianceService.validateCardLast4('12345');
      }).toThrow('Card last 4 digits must be exactly 4 numeric digits');
    });

    it('should throw error for non-numeric characters', () => {
      expect(() => {
        PCIComplianceService.validateCardLast4('12ab');
      }).toThrow('Card last 4 digits must be exactly 4 numeric digits');
    });

    it('should return true for null (optional field)', () => {
      const result = PCIComplianceService.validateCardLast4(null);
      expect(result).toBe(true);
    });

    it('should return true for undefined (optional field)', () => {
      const result = PCIComplianceService.validateCardLast4(undefined);
      expect(result).toBe(true);
    });

    it('should return true for empty string (optional field)', () => {
      const result = PCIComplianceService.validateCardLast4('');
      expect(result).toBe(true);
    });
  });

  describe('checkForForbiddenData', () => {
    it('should return false for data without forbidden fields', () => {
      const data = {
        transactionId: 'TXN_123',
        amount: 1000,
      };

      const result = PCIComplianceService.checkForForbiddenData(data);

      expect(result.hasForbiddenData).toBe(false);
      expect(result.forbiddenFields).toHaveLength(0);
    });

    it('should detect cardNumber', () => {
      const data = {
        cardNumber: '1234567890123456',
      };

      const result = PCIComplianceService.checkForForbiddenData(data);

      expect(result.hasForbiddenData).toBe(true);
      expect(result.forbiddenFields).toContain('cardNumber');
    });

    it('should detect cvv', () => {
      const data = {
        cvv: '123',
      };

      const result = PCIComplianceService.checkForForbiddenData(data);

      expect(result.hasForbiddenData).toBe(true);
      expect(result.forbiddenFields).toContain('cvv');
    });

    it('should detect multiple forbidden fields', () => {
      const data = {
        cardNumber: '1234567890123456',
        cvv: '123',
        pin: '4567',
      };

      const result = PCIComplianceService.checkForForbiddenData(data);

      expect(result.hasForbiddenData).toBe(true);
      expect(result.forbiddenFields).toHaveLength(3);
      expect(result.forbiddenFields).toContain('cardNumber');
      expect(result.forbiddenFields).toContain('cvv');
      expect(result.forbiddenFields).toContain('pin');
    });

    it('should detect forbidden fields in nested objects', () => {
      const data = {
        payment: {
          details: {
            cvv: '123',
          },
        },
      };

      const result = PCIComplianceService.checkForForbiddenData(data);

      expect(result.hasForbiddenData).toBe(true);
      expect(result.forbiddenFields).toContain('payment.details.cvv');
    });

    it('should handle null data', () => {
      const result = PCIComplianceService.checkForForbiddenData(null);

      expect(result.hasForbiddenData).toBe(false);
      expect(result.forbiddenFields).toHaveLength(0);
    });

    it('should handle undefined data', () => {
      const result = PCIComplianceService.checkForForbiddenData(undefined);

      expect(result.hasForbiddenData).toBe(false);
      expect(result.forbiddenFields).toHaveLength(0);
    });
  });

  describe('getComplianceStatus', () => {
    it('should return compliance status information', () => {
      const status = PCIComplianceService.getComplianceStatus();

      expect(status).toHaveProperty('pciDssVersion');
      expect(status).toHaveProperty('complianceLevel');
      expect(status).toHaveProperty('requirements');
      expect(status.pciDssVersion).toBe('3.2.1');
    });

    it('should include requirement 14.1 status', () => {
      const status = PCIComplianceService.getComplianceStatus();

      expect(status.requirements['14.1']).toBeDefined();
      expect(status.requirements['14.1'].status).toBe('implemented');
      expect(status.requirements['14.1'].description).toContain('card numbers');
    });

    it('should include requirement 14.2 status', () => {
      const status = PCIComplianceService.getComplianceStatus();

      expect(status.requirements['14.2']).toBeDefined();
      expect(status.requirements['14.2'].status).toBe('implemented');
      expect(status.requirements['14.2'].description).toContain('CVV');
    });

    it('should include requirement 14.4 status', () => {
      const status = PCIComplianceService.getComplianceStatus();

      expect(status.requirements['14.4']).toBeDefined();
      expect(status.requirements['14.4'].status).toBe('implemented');
      expect(status.requirements['14.4'].description).toContain('Two-factor');
    });

    it('should include requirement 5.9 status', () => {
      const status = PCIComplianceService.getComplianceStatus();

      expect(status.requirements['5.9']).toBeDefined();
      expect(status.requirements['5.9'].status).toBe('implemented');
      expect(status.requirements['5.9'].description).toContain('Mask');
    });

    it('should include method names for each requirement', () => {
      const status = PCIComplianceService.getComplianceStatus();

      expect(status.requirements['14.1'].method).toBe('validateCardDataNotStored');
      expect(status.requirements['14.2'].method).toBe('validateCardDataNotStored');
      expect(status.requirements['14.4'].method).toBe('validateTwoFactorAuth');
      expect(status.requirements['5.9'].method).toBe('maskCardNumber');
    });
  });
});
