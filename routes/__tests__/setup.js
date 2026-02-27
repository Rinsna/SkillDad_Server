/**
 * Test Setup and Utilities
 * 
 * Provides common setup and teardown for integration tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.HDFC_MERCHANT_ID = 'TEST_MERCHANT_ID';
process.env.HDFC_API_KEY = 'test-api-key';
process.env.HDFC_API_SECRET = 'test-api-secret-key';
process.env.HDFC_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');
process.env.HDFC_GATEWAY_URL = 'https://test-gateway.hdfc.com';
process.env.BASE_URL = 'http://localhost:5000';
process.env.PAYMENT_ENVIRONMENT = 'sandbox';

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Redis client to avoid connection issues in tests
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    quit: jest.fn(),
  })),
}));

// Mock email service to avoid sending real emails in tests
jest.mock('../../services/payment/EmailService', () => {
  return jest.fn().mockImplementation(() => ({
    sendPaymentConfirmation: jest.fn().mockResolvedValue(true),
    sendPaymentFailure: jest.fn().mockResolvedValue(true),
    sendRefundConfirmation: jest.fn().mockResolvedValue(true),
  }));
});

// Mock socket service to avoid WebSocket issues in tests
jest.mock('../../services/SocketService', () => ({
  sendToUser: jest.fn(),
  sendToAll: jest.fn(),
}));

// Mock monitoring service to avoid external dependencies
jest.mock('../../services/payment/MonitoringService', () => ({
  trackPaymentAttempt: jest.fn().mockResolvedValue(undefined),
  trackAPIResponseTime: jest.fn().mockResolvedValue(undefined),
  logAPIError: jest.fn().mockResolvedValue(undefined),
}));

module.exports = {};
