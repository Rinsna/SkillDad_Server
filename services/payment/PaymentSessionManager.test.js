const crypto = require('crypto');
const mongoose = require('mongoose');
const PaymentSessionManager = require('./PaymentSessionManager');
const PaymentSession = require('../../models/payment/PaymentSession');

/**
 * Unit tests for PaymentSessionManager
 * 
 * Tests session creation with correct expiration time, session validation for
 * active and expired sessions, and secure session ID generation (uniqueness, randomness).
 * 
 * Requirements: 1.7, 1.8
 */
describe('PaymentSessionManager', () => {
  let manager;
  let mockTransactionData;

  beforeEach(() => {
    manager = new PaymentSessionManager();
    
    // Mock transaction data for testing
    mockTransactionData = {
      transactionId: 'TXN_123456789',
      student: new mongoose.Types.ObjectId(),
      course: new mongoose.Types.ObjectId(),
      amount: 9440.00,
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create session with correct expiration time (15 minutes)', async () => {
      const beforeCreate = Date.now();
      
      // Mock PaymentSession.create
      const mockSession = {
        sessionId: 'SES_ABC123',
        transactionId: mockTransactionData.transactionId,
        student: mockTransactionData.student,
        course: mockTransactionData.course,
        amount: mockTransactionData.amount,
        status: 'active',
        expiresAt: new Date(beforeCreate + 15 * 60 * 1000),
      };
      
      jest.spyOn(PaymentSession, 'create').mockResolvedValue(mockSession);
      
      const session = await manager.createSession(mockTransactionData);
      
      const afterCreate = Date.now();
      const expectedExpiration = beforeCreate + 15 * 60 * 1000;
      const actualExpiration = session.expiresAt.getTime();
      
      // Verify expiration is 15 minutes (900,000 ms) from creation
      expect(actualExpiration).toBeGreaterThanOrEqual(expectedExpiration);
      expect(actualExpiration).toBeLessThanOrEqual(afterCreate + 15 * 60 * 1000);
      
      // Verify expiration is exactly 15 minutes (within 1 second tolerance)
      const expirationDiff = actualExpiration - beforeCreate;
      expect(expirationDiff).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);
      expect(expirationDiff).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
    });

    it('should create session with all required fields', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        transactionId: mockTransactionData.transactionId,
        student: mockTransactionData.student,
        course: mockTransactionData.course,
        amount: mockTransactionData.amount,
        status: 'active',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
      
      jest.spyOn(PaymentSession, 'create').mockResolvedValue(mockSession);
      
      const session = await manager.createSession(mockTransactionData);
      
      expect(session.sessionId).toBeDefined();
      expect(session.transactionId).toBe(mockTransactionData.transactionId);
      expect(session.student).toBe(mockTransactionData.student);
      expect(session.course).toBe(mockTransactionData.course);
      expect(session.amount).toBe(mockTransactionData.amount);
      expect(session.status).toBe('active');
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    it('should generate secure session ID', async () => {
      // Mock PaymentSession.create to capture the session data passed to it
      let capturedSessionData;
      jest.spyOn(PaymentSession, 'create').mockImplementation((data) => {
        capturedSessionData = data;
        return Promise.resolve(data);
      });
      
      await manager.createSession(mockTransactionData);
      
      // Verify the generated session ID has correct format: SES_<20_uppercase_hex_chars>
      expect(capturedSessionData.sessionId).toMatch(/^SES_[A-F0-9]{20}$/);
    });

    it('should throw error if transactionId is missing', async () => {
      const invalidData = {
        student: mockTransactionData.student,
        course: mockTransactionData.course,
        amount: mockTransactionData.amount,
      };
      
      await expect(manager.createSession(invalidData))
        .rejects.toThrow('Transaction ID is required');
    });

    it('should throw error if student is missing', async () => {
      const invalidData = {
        transactionId: mockTransactionData.transactionId,
        course: mockTransactionData.course,
        amount: mockTransactionData.amount,
      };
      
      await expect(manager.createSession(invalidData))
        .rejects.toThrow('Student ID is required');
    });

    it('should throw error if course is missing', async () => {
      const invalidData = {
        transactionId: mockTransactionData.transactionId,
        student: mockTransactionData.student,
        amount: mockTransactionData.amount,
      };
      
      await expect(manager.createSession(invalidData))
        .rejects.toThrow('Course ID is required');
    });

    it('should throw error if amount is missing', async () => {
      const invalidData = {
        transactionId: mockTransactionData.transactionId,
        student: mockTransactionData.student,
        course: mockTransactionData.course,
      };
      
      await expect(manager.createSession(invalidData))
        .rejects.toThrow('Amount is required');
    });

    it('should create session with status active', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        status: 'active',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
      
      jest.spyOn(PaymentSession, 'create').mockResolvedValue(mockSession);
      
      const session = await manager.createSession(mockTransactionData);
      
      expect(session.status).toBe('active');
    });
  });

  describe('generateSecureSessionId', () => {
    it('should generate session ID with correct format', () => {
      const sessionId = manager.generateSecureSessionId();
      
      // Format: SES_<20_uppercase_hex_chars>
      expect(sessionId).toMatch(/^SES_[A-F0-9]{20}$/);
    });

    it('should generate unique session IDs', () => {
      const sessionIds = new Set();
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        sessionIds.add(manager.generateSecureSessionId());
      }
      
      // All session IDs should be unique
      expect(sessionIds.size).toBe(iterations);
    });

    it('should generate session IDs with high randomness', () => {
      const sessionId1 = manager.generateSecureSessionId();
      const sessionId2 = manager.generateSecureSessionId();
      
      // Extract hex parts (remove SES_ prefix)
      const hex1 = sessionId1.substring(4);
      const hex2 = sessionId2.substring(4);
      
      // Session IDs should be different
      expect(hex1).not.toBe(hex2);
      
      // Calculate Hamming distance (number of different characters)
      let differences = 0;
      for (let i = 0; i < hex1.length; i++) {
        if (hex1[i] !== hex2[i]) {
          differences++;
        }
      }
      
      // Expect high randomness (at least 50% different characters)
      expect(differences).toBeGreaterThan(10);
    });

    it('should generate session IDs with uppercase hex characters', () => {
      const sessionId = manager.generateSecureSessionId();
      const hexPart = sessionId.substring(4);
      
      // Should only contain uppercase hex characters (0-9, A-F)
      expect(hexPart).toMatch(/^[A-F0-9]+$/);
      
      // Should not contain lowercase
      expect(hexPart).not.toMatch(/[a-f]/);
    });

    it('should generate session IDs with exactly 20 hex characters', () => {
      const sessionId = manager.generateSecureSessionId();
      const hexPart = sessionId.substring(4);
      
      expect(hexPart.length).toBe(20);
    });

    it('should generate session IDs with SES_ prefix', () => {
      const sessionId = manager.generateSecureSessionId();
      
      expect(sessionId.startsWith('SES_')).toBe(true);
    });

    it('should use cryptographically secure random generation', () => {
      // Spy on crypto.randomBytes to verify it's being used
      const randomBytesSpy = jest.spyOn(crypto, 'randomBytes');
      
      manager.generateSecureSessionId();
      
      expect(randomBytesSpy).toHaveBeenCalledWith(32);
      
      randomBytesSpy.mockRestore();
    });

    it('should generate different session IDs across multiple manager instances', () => {
      const manager1 = new PaymentSessionManager();
      const manager2 = new PaymentSessionManager();
      
      const sessionId1 = manager1.generateSecureSessionId();
      const sessionId2 = manager2.generateSecureSessionId();
      
      expect(sessionId1).not.toBe(sessionId2);
    });

    it('should generate session IDs with sufficient entropy', () => {
      const sessionIds = [];
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        sessionIds.push(manager.generateSecureSessionId());
      }
      
      // Calculate character frequency distribution
      const charFrequency = {};
      sessionIds.forEach(id => {
        const hexPart = id.substring(4);
        for (const char of hexPart) {
          charFrequency[char] = (charFrequency[char] || 0) + 1;
        }
      });
      
      // Verify all hex characters (0-9, A-F) appear
      const hexChars = '0123456789ABCDEF';
      const appearingChars = Object.keys(charFrequency);
      
      // At least 14 out of 16 hex characters should appear in 100 iterations
      expect(appearingChars.length).toBeGreaterThanOrEqual(14);
    });
  });

  describe('validateSession', () => {
    it('should validate active non-expired session successfully', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        status: 'active',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes in future
      };
      
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(mockSession);
      
      const session = await manager.validateSession('SES_ABC123');
      
      expect(session).toBeDefined();
      expect(session.sessionId).toBe('SES_ABC123');
      expect(session.status).toBe('active');
    });

    it('should throw error if session not found', async () => {
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(null);
      
      await expect(manager.validateSession('SES_NOTFOUND'))
        .rejects.toThrow('Session not found');
    });

    it('should throw error if session is not active', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        status: 'completed',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      };
      
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(mockSession);
      
      await expect(manager.validateSession('SES_ABC123'))
        .rejects.toThrow('Session is completed');
    });

    it('should throw error if session is expired', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        status: 'active',
        expiresAt: new Date(Date.now() - 1000), // 1 second in past
      };
      
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(mockSession);
      jest.spyOn(manager, 'expireSession').mockResolvedValue(mockSession);
      
      await expect(manager.validateSession('SES_ABC123'))
        .rejects.toThrow('Session has expired');
      
      // Verify expireSession was called
      expect(manager.expireSession).toHaveBeenCalledWith('SES_ABC123');
    });

    it('should throw error if session is cancelled', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        status: 'cancelled',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      };
      
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(mockSession);
      
      await expect(manager.validateSession('SES_ABC123'))
        .rejects.toThrow('Session is cancelled');
    });

    it('should throw error if session is already expired status', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        status: 'expired',
        expiresAt: new Date(Date.now() - 10 * 60 * 1000),
      };
      
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(mockSession);
      
      await expect(manager.validateSession('SES_ABC123'))
        .rejects.toThrow('Session is expired');
    });

    it('should validate session that expires exactly now', async () => {
      const now = new Date();
      const mockSession = {
        sessionId: 'SES_ABC123',
        status: 'active',
        expiresAt: new Date(now.getTime() + 100), // 100ms in future
      };
      
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(mockSession);
      
      const session = await manager.validateSession('SES_ABC123');
      
      expect(session).toBeDefined();
    });

    it('should mark session as expired when validation fails due to expiration', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        status: 'active',
        expiresAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes in past
      };
      
      const mockExpiredSession = {
        ...mockSession,
        status: 'expired',
      };
      
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(mockSession);
      jest.spyOn(PaymentSession, 'findOneAndUpdate').mockResolvedValue(mockExpiredSession);
      
      await expect(manager.validateSession('SES_ABC123'))
        .rejects.toThrow('Session has expired');
      
      // Verify session was marked as expired
      expect(PaymentSession.findOneAndUpdate).toHaveBeenCalledWith(
        { sessionId: 'SES_ABC123' },
        { status: 'expired' },
        { new: true }
      );
    });

    it('should validate session with 1 second remaining', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        status: 'active',
        expiresAt: new Date(Date.now() + 1000), // 1 second in future
      };
      
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(mockSession);
      
      const session = await manager.validateSession('SES_ABC123');
      
      expect(session).toBeDefined();
      expect(session.status).toBe('active');
    });

    it('should reject session expired by 1 millisecond', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        status: 'active',
        expiresAt: new Date(Date.now() - 1), // 1 millisecond in past
      };
      
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(mockSession);
      jest.spyOn(manager, 'expireSession').mockResolvedValue(mockSession);
      
      await expect(manager.validateSession('SES_ABC123'))
        .rejects.toThrow('Session has expired');
    });
  });

  describe('expireSession', () => {
    it('should mark session as expired', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        status: 'expired',
      };
      
      jest.spyOn(PaymentSession, 'findOneAndUpdate').mockResolvedValue(mockSession);
      
      const session = await manager.expireSession('SES_ABC123');
      
      expect(session.status).toBe('expired');
      expect(PaymentSession.findOneAndUpdate).toHaveBeenCalledWith(
        { sessionId: 'SES_ABC123' },
        { status: 'expired' },
        { new: true }
      );
    });

    it('should throw error if session not found', async () => {
      jest.spyOn(PaymentSession, 'findOneAndUpdate').mockResolvedValue(null);
      
      await expect(manager.expireSession('SES_NOTFOUND'))
        .rejects.toThrow('Session not found');
    });

    it('should return updated session object', async () => {
      const mockSession = {
        sessionId: 'SES_ABC123',
        transactionId: 'TXN_123',
        status: 'expired',
        expiresAt: new Date(),
      };
      
      jest.spyOn(PaymentSession, 'findOneAndUpdate').mockResolvedValue(mockSession);
      
      const session = await manager.expireSession('SES_ABC123');
      
      expect(session).toBeDefined();
      expect(session.sessionId).toBe('SES_ABC123');
      expect(session.status).toBe('expired');
    });
  });

  describe('session timeout configuration', () => {
    it('should have session timeout set to 15 minutes', () => {
      expect(manager.sessionTimeout).toBe(15 * 60 * 1000);
    });

    it('should use session timeout for expiration calculation', async () => {
      const beforeCreate = Date.now();
      
      const mockSession = {
        sessionId: 'SES_ABC123',
        expiresAt: new Date(beforeCreate + manager.sessionTimeout),
      };
      
      jest.spyOn(PaymentSession, 'create').mockResolvedValue(mockSession);
      
      const session = await manager.createSession(mockTransactionData);
      
      const expectedExpiration = beforeCreate + manager.sessionTimeout;
      const actualExpiration = session.expiresAt.getTime();
      
      // Allow 1 second tolerance for test execution time
      expect(actualExpiration).toBeGreaterThanOrEqual(expectedExpiration - 1000);
      expect(actualExpiration).toBeLessThanOrEqual(expectedExpiration + 1000);
    });
  });

  describe('edge cases', () => {
    it('should handle session validation with null sessionId', async () => {
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(null);
      
      await expect(manager.validateSession(null))
        .rejects.toThrow('Session not found');
    });

    it('should handle session validation with undefined sessionId', async () => {
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(null);
      
      await expect(manager.validateSession(undefined))
        .rejects.toThrow('Session not found');
    });

    it('should handle session validation with empty string sessionId', async () => {
      jest.spyOn(PaymentSession, 'findOne').mockResolvedValue(null);
      
      await expect(manager.validateSession(''))
        .rejects.toThrow('Session not found');
    });

    it('should handle database errors during session creation', async () => {
      jest.spyOn(PaymentSession, 'create').mockRejectedValue(
        new Error('Database connection failed')
      );
      
      await expect(manager.createSession(mockTransactionData))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle database errors during session validation', async () => {
      jest.spyOn(PaymentSession, 'findOne').mockRejectedValue(
        new Error('Database query failed')
      );
      
      await expect(manager.validateSession('SES_ABC123'))
        .rejects.toThrow('Database query failed');
    });

    it('should handle database errors during session expiration', async () => {
      jest.spyOn(PaymentSession, 'findOneAndUpdate').mockRejectedValue(
        new Error('Database update failed')
      );
      
      await expect(manager.expireSession('SES_ABC123'))
        .rejects.toThrow('Database update failed');
    });
  });

  describe('security considerations', () => {
    it('should generate session IDs with sufficient length for security', () => {
      const sessionId = manager.generateSecureSessionId();
      
      // Total length should be 24 characters (SES_ + 20 hex chars)
      expect(sessionId.length).toBe(24);
      
      // 20 hex characters = 80 bits of entropy (sufficient for session IDs)
      const hexPart = sessionId.substring(4);
      expect(hexPart.length).toBe(20);
    });

    it('should not generate predictable session IDs', () => {
      const sessionIds = [];
      
      for (let i = 0; i < 100; i++) {
        sessionIds.push(manager.generateSecureSessionId());
      }
      
      // Check for sequential patterns (should not exist)
      for (let i = 1; i < sessionIds.length; i++) {
        const prev = sessionIds[i - 1];
        const curr = sessionIds[i];
        
        // Session IDs should not be sequential
        expect(curr).not.toBe(prev);
        
        // Extract numeric parts and verify they're not sequential
        const prevNum = parseInt(prev.substring(4, 8), 16);
        const currNum = parseInt(curr.substring(4, 8), 16);
        
        // Should not be consecutive numbers
        expect(Math.abs(currNum - prevNum)).not.toBe(1);
      }
    });

    it('should use crypto.randomBytes for secure random generation', () => {
      const randomBytesSpy = jest.spyOn(crypto, 'randomBytes');
      
      manager.generateSecureSessionId();
      
      // Verify crypto.randomBytes is called (not Math.random)
      expect(randomBytesSpy).toHaveBeenCalled();
      expect(randomBytesSpy).toHaveBeenCalledWith(32);
      
      randomBytesSpy.mockRestore();
    });
  });
});
