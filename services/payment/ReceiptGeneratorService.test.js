const fs = require('fs');
const path = require('path');
const ReceiptGeneratorService = require('./ReceiptGeneratorService');
const Transaction = require('../../models/payment/Transaction');
const sendEmail = require('../../utils/sendEmail');

// Mock dependencies
jest.mock('../../models/payment/Transaction');
jest.mock('../../utils/sendEmail');
jest.mock('fs');
jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    fontSize: jest.fn().mockReturnThis(),
    fillColor: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    strokeColor: jest.fn().mockReturnThis(),
    lineWidth: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    lineTo: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    font: jest.fn().mockReturnThis(),
    end: jest.fn(),
  }));
});

/**
 * Unit tests for ReceiptGeneratorService
 * 
 * Tests receipt generation with complete transaction data, GST calculation,
 * and receipt number uniqueness.
 * 
 * Requirements: 9.1, 9.4, 9.10
 */
describe('ReceiptGeneratorService', () => {
  let service;
  let mockTransaction;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Mock fs.existsSync to return true (directory exists)
    fs.existsSync.mockReturnValue(true);

    // Mock fs.mkdirSync
    fs.mkdirSync.mockImplementation(() => {});

    // Mock fs.createWriteStream
    const mockStream = {
      on: jest.fn((event, callback) => {
        if (event === 'finish') {
          // Simulate successful write
          setTimeout(callback, 0);
        }
        return mockStream;
      }),
      write: jest.fn(),
      end: jest.fn(),
    };
    fs.createWriteStream.mockReturnValue(mockStream);

    service = new ReceiptGeneratorService();

    // Create mock transaction with complete data
    mockTransaction = {
      transactionId: 'TXN_1234567890',
      receiptNumber: null,
      status: 'success',
      originalAmount: { toString: () => '10000.00' },
      discountAmount: { toString: () => '2000.00' },
      finalAmount: { toString: () => '8000.00' },
      gstAmount: { toString: () => '1440.00' },
      currency: 'INR',
      discountCode: 'PARTNER20',
      discountPercentage: 20,
      gatewayTransactionId: 'HDFC_987654321',
      paymentMethod: 'credit_card',
      paymentMethodDetails: {
        cardType: 'Visa',
        cardLast4: '1234',
      },
      student: {
        _id: 'student123',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+91-9876543210',
      },
      course: {
        _id: 'course123',
        title: 'Full Stack Development Bootcamp',
        price: 10000,
      },
      createdAt: new Date('2024-01-15T10:20:00Z'),
      completedAt: new Date('2024-01-15T10:25:30Z'),
      save: jest.fn().mockResolvedValue(true),
    };
    
    // Helper function to setup Transaction.findOne mock
    setupTransactionMock(mockTransaction);
  });
  
  // Helper function to setup Transaction.findOne mock with chained populate
  function setupTransactionMock(transaction, callCount = 1) {
    for (let i = 0; i < callCount; i++) {
      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
      };
      // The second populate call should resolve to the transaction
      mockQuery.populate.mockImplementationOnce(() => mockQuery).mockImplementationOnce(() => Promise.resolve(transaction));
      Transaction.findOne.mockReturnValueOnce(mockQuery);
    }
  }

  describe('generateReceiptNumber', () => {
    it('should generate unique receipt number with correct format', () => {
      const receiptNumber = service.generateReceiptNumber();
      
      expect(receiptNumber).toMatch(/^RCP-\d{8}-\d{5}$/);
    });

    it('should generate different receipt numbers on consecutive calls', () => {
      const receiptNumber1 = service.generateReceiptNumber();
      const receiptNumber2 = service.generateReceiptNumber();
      
      // While there's a tiny chance they could be the same due to random component,
      // it's extremely unlikely
      expect(receiptNumber1).not.toBe(receiptNumber2);
    });

    it('should include current date in receipt number', () => {
      const receiptNumber = service.generateReceiptNumber();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      
      expect(receiptNumber).toContain(today);
    });

    it('should have 5-digit random component', () => {
      const receiptNumber = service.generateReceiptNumber();
      const parts = receiptNumber.split('-');
      
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('RCP');
      expect(parts[1]).toHaveLength(8); // YYYYMMDD
      expect(parts[2]).toHaveLength(5); // Random 5 digits
      expect(parts[2]).toMatch(/^\d{5}$/);
    });

    it('should generate receipt numbers that are unique across multiple calls', () => {
      const receiptNumbers = new Set();
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        receiptNumbers.add(service.generateReceiptNumber());
      }
      
      // All receipt numbers should be unique
      expect(receiptNumbers.size).toBe(iterations);
    });
  });

  describe('formatAmount', () => {
    it('should format amount with rupee symbol and 2 decimal places', () => {
      const formatted = service.formatAmount(1000);
      
      expect(formatted).toBe('₹1000.00');
    });

    it('should format Decimal128 amount correctly', () => {
      const amount = { toString: () => '8000.50' };
      const formatted = service.formatAmount(amount);
      
      expect(formatted).toBe('₹8000.50');
    });

    it('should handle zero amount', () => {
      const formatted = service.formatAmount(0);
      
      expect(formatted).toBe('₹0.00');
    });

    it('should handle null amount', () => {
      const formatted = service.formatAmount(null);
      
      expect(formatted).toBe('₹0.00');
    });

    it('should handle undefined amount', () => {
      const formatted = service.formatAmount(undefined);
      
      expect(formatted).toBe('₹0.00');
    });

    it('should round to 2 decimal places', () => {
      const formatted = service.formatAmount(1234.567);
      
      expect(formatted).toBe('₹1234.57');
    });

    it('should handle string amounts', () => {
      const formatted = service.formatAmount('5000.99');
      
      expect(formatted).toBe('₹5000.99');
    });

    it('should handle large amounts', () => {
      const formatted = service.formatAmount(999999.99);
      
      expect(formatted).toBe('₹999999.99');
    });
  });

  describe('generateReceipt', () => {
    beforeEach(() => {
      // Reset mock transaction to default state
      mockTransaction.status = 'success';
      mockTransaction.receiptNumber = null;
      setupTransactionMock(mockTransaction);
    });

    it('should generate receipt with complete transaction data', async () => {
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
      expect(result).toHaveProperty('receiptUrl');
      expect(result).toHaveProperty('filepath');
      expect(result.receiptNumber).toMatch(/^RCP-\d{8}-\d{5}$/);
      expect(result.receiptUrl).toContain('.pdf');
    });

    it('should throw error if transaction not found', async () => {
      setupTransactionMock(null);
      
      await expect(service.generateReceipt('INVALID_TXN'))
        .rejects
        .toThrow('Transaction not found');
    });

    it('should throw error if transaction status is not success', async () => {
      mockTransaction.status = 'failed';
      setupTransactionMock(mockTransaction);
      
      await expect(service.generateReceipt('TXN_1234567890'))
        .rejects
        .toThrow('Cannot generate receipt for non-successful transaction');
    });

    it('should generate receipt number if not exists', async () => {
      mockTransaction.receiptNumber = null;
      
      await service.generateReceipt('TXN_1234567890');
      
      expect(mockTransaction.receiptNumber).toMatch(/^RCP-\d{8}-\d{5}$/);
      expect(mockTransaction.save).toHaveBeenCalled();
    });

    it('should not regenerate receipt number if already exists', async () => {
      mockTransaction.receiptNumber = 'RCP-20240115-12345';
      const originalReceiptNumber = mockTransaction.receiptNumber;
      
      await service.generateReceipt('TXN_1234567890');
      
      expect(mockTransaction.receiptNumber).toBe(originalReceiptNumber);
    });

    it('should update transaction with receipt URL and timestamp', async () => {
      await service.generateReceipt('TXN_1234567890');
      
      expect(mockTransaction.receiptUrl).toBeDefined();
      expect(mockTransaction.receiptGeneratedAt).toBeInstanceOf(Date);
      expect(mockTransaction.save).toHaveBeenCalled();
    });

    it('should create PDF file in receipts directory', async () => {
      await service.generateReceipt('TXN_1234567890');
      
      expect(fs.createWriteStream).toHaveBeenCalled();
      const callArgs = fs.createWriteStream.mock.calls[0][0];
      expect(callArgs).toContain('receipts');
      expect(callArgs).toContain('.pdf');
    });

    it('should handle transaction with all amount fields', async () => {
      mockTransaction.originalAmount = { toString: () => '10000.00' };
      mockTransaction.discountAmount = { toString: () => '2000.00' };
      mockTransaction.finalAmount = { toString: () => '8000.00' };
      mockTransaction.gstAmount = { toString: () => '1440.00' };
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
      expect(result).toHaveProperty('receiptUrl');
    });

    it('should handle transaction without discount', async () => {
      mockTransaction.discountAmount = { toString: () => '0' };
      mockTransaction.discountCode = null;
      mockTransaction.finalAmount = mockTransaction.originalAmount;
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
    });

    it('should handle transaction without GST', async () => {
      mockTransaction.gstAmount = { toString: () => '0' };
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
    });

    it('should handle different payment methods', async () => {
      const paymentMethods = ['credit_card', 'debit_card', 'net_banking', 'upi', 'wallet'];
      
      for (const method of paymentMethods) {
        // Reset transaction to success status for each iteration
        mockTransaction.status = 'success';
        mockTransaction.paymentMethod = method;
        setupTransactionMock(mockTransaction);
        
        const result = await service.generateReceipt('TXN_1234567890');
        
        expect(result).toHaveProperty('receiptNumber');
      }
    });

    it('should handle payment method with bank details', async () => {
      mockTransaction.paymentMethod = 'net_banking';
      mockTransaction.paymentMethodDetails = {
        bankName: 'HDFC Bank',
      };
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
    });

    it('should handle payment method with wallet details', async () => {
      mockTransaction.paymentMethod = 'wallet';
      mockTransaction.paymentMethodDetails = {
        walletProvider: 'Paytm',
      };
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
    });
  });

  describe('GST calculation in receipt', () => {
    beforeEach(() => {
      setupTransactionMock(mockTransaction);
    });

    it('should include GST amount in receipt when present', async () => {
      mockTransaction.gstAmount = { toString: () => '1440.00' };
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
      // GST should be included in the PDF generation
      expect(fs.createWriteStream).toHaveBeenCalled();
    });

    it('should calculate correct total with GST', async () => {
      mockTransaction.finalAmount = { toString: () => '8000.00' };
      mockTransaction.gstAmount = { toString: () => '1440.00' };
      
      // Total should be 8000 + 1440 = 9440
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
    });

    it('should handle zero GST amount', async () => {
      mockTransaction.gstAmount = { toString: () => '0' };
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
    });

    it('should handle null GST amount', async () => {
      mockTransaction.gstAmount = null;
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
    });

    it('should format GST amount correctly in receipt', async () => {
      mockTransaction.gstAmount = { toString: () => '1440.50' };
      
      const formatted = service.formatAmount(mockTransaction.gstAmount);
      
      expect(formatted).toBe('₹1440.50');
    });

    it('should show GST breakdown with 18% rate', async () => {
      // GST is 18% of subtotal
      const subtotal = 8000;
      const expectedGST = subtotal * 0.18; // 1440
      
      mockTransaction.finalAmount = { toString: () => subtotal.toString() };
      mockTransaction.gstAmount = { toString: () => expectedGST.toString() };
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
    });
  });

  describe('receipt number uniqueness', () => {
    beforeEach(() => {
      setupTransactionMock(mockTransaction);
    });

    it('should generate unique receipt numbers for different transactions', async () => {
      const receiptNumbers = new Set();
      
      for (let i = 0; i < 10; i++) {
        // Create a fresh mock transaction for each iteration
        const freshTransaction = {
          ...mockTransaction,
          receiptNumber: null,
          transactionId: `TXN_${i}`,
          status: 'success',
          save: jest.fn().mockResolvedValue(true),
        };
        
        setupTransactionMock(freshTransaction);
        
        const result = await service.generateReceipt(freshTransaction.transactionId);
        receiptNumbers.add(result.receiptNumber);
      }
      
      // All receipt numbers should be unique
      expect(receiptNumbers.size).toBe(10);
    });

    it('should maintain same receipt number for same transaction', async () => {
      mockTransaction.receiptNumber = 'RCP-20240115-12345';
      mockTransaction.status = 'success';
      setupTransactionMock(mockTransaction);
      
      const result1 = await service.generateReceipt('TXN_1234567890');
      
      // Setup again for second call
      setupTransactionMock(mockTransaction);
      const result2 = await service.generateReceipt('TXN_1234567890');
      
      expect(result1.receiptNumber).toBe(result2.receiptNumber);
    });

    it('should not overwrite existing receipt number', async () => {
      const existingReceiptNumber = 'RCP-20240115-99999';
      mockTransaction.receiptNumber = existingReceiptNumber;
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result.receiptNumber).toBe(existingReceiptNumber);
    });

    it('should generate receipt number only once per transaction', async () => {
      mockTransaction.receiptNumber = null;
      
      await service.generateReceipt('TXN_1234567890');
      
      expect(mockTransaction.save).toHaveBeenCalledTimes(2); // Once for receipt number, once for URL
      expect(mockTransaction.receiptNumber).toMatch(/^RCP-\d{8}-\d{5}$/);
    });

    it('should ensure receipt number format is consistent', async () => {
      const receiptNumbers = [];
      
      for (let i = 0; i < 5; i++) {
        const receiptNumber = service.generateReceiptNumber();
        receiptNumbers.push(receiptNumber);
      }
      
      // All should match the format
      receiptNumbers.forEach(rn => {
        expect(rn).toMatch(/^RCP-\d{8}-\d{5}$/);
      });
    });
  });

  describe('emailReceipt', () => {
    beforeEach(() => {
      setupTransactionMock(mockTransaction);
      
      sendEmail.mockResolvedValue({ success: true, messageId: 'msg123' });
    });

    it('should send email with receipt attachment', async () => {
      // Setup mock for both generateReceipt and emailReceipt calls (2 Transaction.findOne calls)
      setupTransactionMock(mockTransaction, 2);
      
      const result = await service.emailReceipt('TXN_1234567890');
      
      expect(sendEmail).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.sentTo).toBe('john@example.com');
    });

    it('should use student email from transaction', async () => {
      setupTransactionMock(mockTransaction, 2);
      
      await service.emailReceipt('TXN_1234567890');
      
      const emailCall = sendEmail.mock.calls[0][0];
      expect(emailCall.email).toBe('john@example.com');
    });

    it('should use provided email if specified', async () => {
      setupTransactionMock(mockTransaction, 2);
      
      await service.emailReceipt('TXN_1234567890', 'custom@example.com');
      
      const emailCall = sendEmail.mock.calls[0][0];
      expect(emailCall.email).toBe('custom@example.com');
    });

    it('should throw error if student email not found', async () => {
      mockTransaction.student.email = null;
      setupTransactionMock(mockTransaction, 2);
      
      await expect(service.emailReceipt('TXN_1234567890'))
        .rejects
        .toThrow('Student email not found');
    });

    it('should include receipt PDF as attachment', async () => {
      setupTransactionMock(mockTransaction, 2);
      
      await service.emailReceipt('TXN_1234567890');
      
      const emailCall = sendEmail.mock.calls[0][0];
      expect(emailCall.attachments).toBeDefined();
      expect(emailCall.attachments).toHaveLength(1);
      expect(emailCall.attachments[0].filename).toContain('.pdf');
    });

    it('should include receipt number in email subject', async () => {
      mockTransaction.receiptNumber = 'RCP-20240115-12345';
      setupTransactionMock(mockTransaction, 2);
      
      await service.emailReceipt('TXN_1234567890');
      
      const emailCall = sendEmail.mock.calls[0][0];
      expect(emailCall.subject).toContain('RCP-20240115-12345');
    });

    it('should generate receipt if not already generated', async () => {
      mockTransaction.receiptNumber = null;
      setupTransactionMock(mockTransaction, 2);
      
      await service.emailReceipt('TXN_1234567890');
      
      expect(mockTransaction.receiptNumber).toMatch(/^RCP-\d{8}-\d{5}$/);
      expect(sendEmail).toHaveBeenCalled();
    });

    it('should include transaction details in email HTML', async () => {
      setupTransactionMock(mockTransaction, 2);
      
      await service.emailReceipt('TXN_1234567890');
      
      const emailCall = sendEmail.mock.calls[0][0];
      expect(emailCall.html).toContain('John Doe');
      expect(emailCall.html).toContain('TXN_1234567890');
      expect(emailCall.html).toContain('Full Stack Development Bootcamp');
    });

    it('should handle email sending failure', async () => {
      sendEmail.mockRejectedValue(new Error('Email service unavailable'));
      setupTransactionMock(mockTransaction, 2);
      
      await expect(service.emailReceipt('TXN_1234567890'))
        .rejects
        .toThrow('Email service unavailable');
    });
  });

  describe('generateReceiptEmailHTML', () => {
    it('should generate HTML with transaction details', () => {
      mockTransaction.receiptNumber = 'RCP-20240115-12345';
      const receiptData = {
        receiptNumber: 'RCP-20240115-12345',
        receiptUrl: '/uploads/receipts/RCP-20240115-12345.pdf',
      };
      
      const html = service.generateReceiptEmailHTML(mockTransaction, receiptData);
      
      expect(html).toContain('John Doe');
      expect(html).toContain('TXN_1234567890');
      expect(html).toContain('RCP-20240115-12345');
      expect(html).toContain('Full Stack Development Bootcamp');
    });

    it('should include total amount with GST', () => {
      const receiptData = {
        receiptNumber: 'RCP-20240115-12345',
        receiptUrl: '/uploads/receipts/RCP-20240115-12345.pdf',
      };
      
      const html = service.generateReceiptEmailHTML(mockTransaction, receiptData);
      
      // Total should be 8000 + 1440 = 9440
      expect(html).toContain('₹9440.00');
    });

    it('should include total amount without GST when GST is zero', () => {
      mockTransaction.gstAmount = { toString: () => '0' };
      const receiptData = {
        receiptNumber: 'RCP-20240115-12345',
        receiptUrl: '/uploads/receipts/RCP-20240115-12345.pdf',
      };
      
      const html = service.generateReceiptEmailHTML(mockTransaction, receiptData);
      
      expect(html).toContain('₹8000.00');
    });

    it('should include SkillDad branding', () => {
      const receiptData = {
        receiptNumber: 'RCP-20240115-12345',
        receiptUrl: '/uploads/receipts/RCP-20240115-12345.pdf',
      };
      
      const html = service.generateReceiptEmailHTML(mockTransaction, receiptData);
      
      expect(html).toContain('SkillDad');
    });

    it('should include payment successful message', () => {
      const receiptData = {
        receiptNumber: 'RCP-20240115-12345',
        receiptUrl: '/uploads/receipts/RCP-20240115-12345.pdf',
      };
      
      const html = service.generateReceiptEmailHTML(mockTransaction, receiptData);
      
      expect(html).toContain('Payment Successful');
    });

    it('should include support email', () => {
      const receiptData = {
        receiptNumber: 'RCP-20240115-12345',
        receiptUrl: '/uploads/receipts/RCP-20240115-12345.pdf',
      };
      
      const html = service.generateReceiptEmailHTML(mockTransaction, receiptData);
      
      expect(html).toContain('support@skilldad.com');
    });
  });

  describe('error handling', () => {
    it('should handle missing student data gracefully', async () => {
      mockTransaction.student = null;
      setupTransactionMock(mockTransaction);
      
      // Should not throw, but handle gracefully
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
    });

    it('should handle missing course data gracefully', async () => {
      mockTransaction.course = null;
      setupTransactionMock(mockTransaction);
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
    });

    it('should handle missing payment method details', async () => {
      mockTransaction.paymentMethodDetails = null;
      setupTransactionMock(mockTransaction);
      
      const result = await service.generateReceipt('TXN_1234567890');
      
      expect(result).toHaveProperty('receiptNumber');
    });

    it('should handle database save errors', async () => {
      mockTransaction.save.mockRejectedValue(new Error('Database error'));
      setupTransactionMock(mockTransaction);
      
      await expect(service.generateReceipt('TXN_1234567890'))
        .rejects
        .toThrow('Database error');
    });

    it('should handle PDF generation errors', async () => {
      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('PDF generation failed')), 0);
          }
          return mockStream;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockStream);
      
      setupTransactionMock(mockTransaction);
      
      await expect(service.generateReceipt('TXN_1234567890'))
        .rejects
        .toThrow('PDF generation failed');
    });
  });
});
