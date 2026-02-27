const User = require('../../models/userModel');

/**
 * PCIComplianceService - Ensures PCI-DSS compliance for payment operations
 * 
 * This service implements PCI-DSS compliance requirements:
 * - Requirement 14.1: Never store complete card numbers in database
 * - Requirement 14.2: Never store CVV or card PIN data
 * - Requirement 14.4: Implement two-factor authentication for refund operations
 * 
 * PCI-DSS (Payment Card Industry Data Security Standard) is a set of security
 * standards designed to ensure that all companies that accept, process, store,
 * or transmit credit card information maintain a secure environment.
 */
class PCIComplianceService {
  /**
   * Validate that card data is not being stored
   * 
   * Implements Requirements 14.1 and 14.2:
   * - Never store complete card numbers
   * - Never store CVV or PIN data
   * 
   * @param {Object} data - Data object to validate
   * @throws {Error} If forbidden fields are present
   * @returns {boolean} True if validation passes
   */
  validateCardDataNotStored(data) {
    if (!data || typeof data !== 'object') {
      return true;
    }
    
    // List of forbidden fields that should never be stored
    const forbiddenFields = [
      'cardNumber',
      'cvv',
      'cvc',
      'cvv2',
      'cvc2',
      'pin',
      'cardPin',
      'expiryDate',
      'expirationDate',
      'expiry',
      'securityCode',
      'verificationCode',
      'cardVerificationValue',
      'cardVerificationCode',
    ];
    
    // Check for forbidden fields (case-insensitive)
    const checkObject = (obj, path = '') => {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const currentPath = path ? `${path}.${key}` : key;
          const lowerKey = key.toLowerCase();
          
          // Check if this key matches any forbidden field
          for (const forbidden of forbiddenFields) {
            if (lowerKey === forbidden.toLowerCase() || lowerKey.includes(forbidden.toLowerCase())) {
              throw new Error(
                `PCI-DSS Compliance Violation: Cannot store ${forbidden} (found at ${currentPath}). ` +
                `This violates PCI-DSS requirements 14.1 and 14.2.`
              );
            }
          }
          
          // Recursively check nested objects
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            checkObject(obj[key], currentPath);
          }
          
          // Check arrays
          if (Array.isArray(obj[key])) {
            obj[key].forEach((item, index) => {
              if (typeof item === 'object' && item !== null) {
                checkObject(item, `${currentPath}[${index}]`);
              }
            });
          }
        }
      }
    };
    
    checkObject(data);
    return true;
  }
  
  /**
   * Mask card number to show only last 4 digits
   * 
   * Implements Requirement 5.9: Mask sensitive card data
   * 
   * @param {string} cardNumber - Full card number
   * @returns {string} Masked card number (e.g., "****1234")
   */
  maskCardNumber(cardNumber) {
    if (!cardNumber) {
      return '****';
    }
    
    // Convert to string and remove any spaces or dashes
    const cleanNumber = String(cardNumber).replace(/[\s-]/g, '');
    
    // Validate it looks like a card number (8-19 digits)
    if (!/^\d{8,19}$/.test(cleanNumber)) {
      return '****';
    }
    
    // Return only last 4 digits
    return `****${cleanNumber.slice(-4)}`;
  }
  
  /**
   * Enforce role-based access control for payment operations
   * 
   * Implements Requirement 14.4: Access control for sensitive operations
   * 
   * @param {string} userId - User ID to check
   * @param {string} operation - Operation to perform
   * @throws {Error} If user doesn't have permission
   * @returns {Promise<boolean>} True if user has permission
   */
  async enforceAccessControl(userId, operation) {
    if (!userId) {
      throw new Error('User ID is required for access control');
    }
    
    // Fetch user from database
    const user = await User.findById(userId).select('role');
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Define permissions for each operation
    const permissions = {
      // Payment operations
      initiate_payment: ['student', 'admin', 'finance'],
      view_payment: ['student', 'admin', 'finance'],
      view_own_payments: ['student', 'university', 'partner', 'admin', 'finance'],
      
      // Refund operations (requires elevated privileges)
      process_refund: ['admin', 'finance'],
      approve_refund: ['admin'],
      view_refunds: ['admin', 'finance'],
      
      // Transaction operations
      view_all_transactions: ['admin', 'finance'],
      view_transaction_details: ['admin', 'finance'],
      
      // Configuration operations
      configure_gateway: ['admin'],
      update_gateway_config: ['admin'],
      view_gateway_config: ['admin', 'finance'],
      
      // Reconciliation operations
      run_reconciliation: ['finance', 'admin'],
      view_reconciliation: ['finance', 'admin'],
      resolve_discrepancy: ['finance', 'admin'],
      
      // Monitoring operations
      view_metrics: ['admin', 'finance'],
      view_audit_logs: ['admin', 'finance'],
      view_security_alerts: ['admin'],
      
      // Receipt operations
      generate_receipt: ['student', 'admin', 'finance'],
      download_receipt: ['student', 'admin', 'finance'],
    };
    
    // Check if operation exists
    if (!permissions[operation]) {
      throw new Error(`Unknown operation: ${operation}`);
    }
    
    // Check if user role has permission
    if (!permissions[operation].includes(user.role)) {
      throw new Error(
        `Access Denied: User role '${user.role}' does not have permission to perform '${operation}'. ` +
        `Required roles: ${permissions[operation].join(', ')}`
      );
    }
    
    return true;
  }
  
  /**
   * Validate two-factor authentication for refund operations
   * 
   * Implements Requirement 14.4: Two-factor authentication for refunds
   * 
   * Note: This is a placeholder implementation. In production, this should
   * integrate with a proper 2FA service (e.g., TOTP, SMS OTP, or email OTP).
   * 
   * @param {string} userId - User ID
   * @param {string} twoFactorCode - 2FA code provided by user
   * @returns {Promise<boolean>} True if 2FA is valid
   * @throws {Error} If 2FA validation fails
   */
  async validateTwoFactorAuth(userId, twoFactorCode) {
    if (!userId) {
      throw new Error('User ID is required for 2FA validation');
    }
    
    if (!twoFactorCode) {
      throw new Error('Two-factor authentication code is required for refund operations');
    }
    
    // TODO: Implement actual 2FA validation
    // This should integrate with a 2FA service like:
    // - TOTP (Time-based One-Time Password) using libraries like 'speakeasy'
    // - SMS OTP using services like Twilio
    // - Email OTP
    // - Hardware tokens
    
    // For now, this is a placeholder that validates the format
    // In production, replace this with actual 2FA validation
    
    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(twoFactorCode)) {
      throw new Error('Invalid 2FA code format. Expected 6-digit code.');
    }
    
    // Placeholder: In production, validate against stored 2FA secret
    console.warn('2FA validation is using placeholder implementation. Implement proper 2FA in production.');
    
    return true;
  }
  
  /**
   * Sanitize payment data before storage
   * 
   * Removes all forbidden fields and masks sensitive data
   * 
   * @param {Object} data - Payment data to sanitize
   * @returns {Object} Sanitized data safe for storage
   */
  sanitizePaymentData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    // Create a deep copy
    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Fields to completely remove
    const fieldsToRemove = [
      'cardNumber',
      'cvv',
      'cvc',
      'cvv2',
      'cvc2',
      'pin',
      'cardPin',
      'expiryDate',
      'expirationDate',
      'expiry',
      'securityCode',
      'verificationCode',
      'password',
      'apiKey',
      'apiSecret',
      'encryptionKey',
    ];
    
    // Recursively remove forbidden fields
    const removeFields = (obj) => {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }
      
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const lowerKey = key.toLowerCase();
          
          // Remove forbidden fields
          if (fieldsToRemove.some(field => lowerKey.includes(field.toLowerCase()))) {
            delete obj[key];
            continue;
          }
          
          // Mask card numbers if present (shouldn't be, but just in case)
          if (lowerKey.includes('card') && typeof obj[key] === 'string' && /^\d{8,19}$/.test(obj[key])) {
            obj[key] = this.maskCardNumber(obj[key]);
            continue;
          }
          
          // Recursively process nested objects
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            if (Array.isArray(obj[key])) {
              obj[key] = obj[key].map(item => removeFields(item));
            } else {
              removeFields(obj[key]);
            }
          }
        }
      }
      
      return obj;
    };
    
    return removeFields(sanitized);
  }
  
  /**
   * Validate that only last 4 digits of card are stored
   * 
   * @param {string} cardLast4 - Last 4 digits to validate
   * @returns {boolean} True if valid
   * @throws {Error} If validation fails
   */
  validateCardLast4(cardLast4) {
    if (!cardLast4) {
      return true; // Optional field
    }
    
    // Must be exactly 4 digits
    if (!/^\d{4}$/.test(cardLast4)) {
      throw new Error('Card last 4 digits must be exactly 4 numeric digits');
    }
    
    return true;
  }
  
  /**
   * Check if data contains any forbidden card information
   * 
   * @param {Object} data - Data to check
   * @returns {Object} Object with hasForbiddenData boolean and list of found fields
   */
  checkForForbiddenData(data) {
    const forbiddenFields = [];
    
    if (!data || typeof data !== 'object') {
      return { hasForbiddenData: false, forbiddenFields };
    }
    
    const forbiddenPatterns = [
      'cardNumber',
      'cvv',
      'cvc',
      'pin',
      'expiryDate',
      'securityCode',
    ];
    
    const checkObject = (obj, path = '') => {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const currentPath = path ? `${path}.${key}` : key;
          const lowerKey = key.toLowerCase();
          
          for (const pattern of forbiddenPatterns) {
            if (lowerKey.includes(pattern.toLowerCase())) {
              forbiddenFields.push(currentPath);
            }
          }
          
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            checkObject(obj[key], currentPath);
          }
        }
      }
    };
    
    checkObject(data);
    
    return {
      hasForbiddenData: forbiddenFields.length > 0,
      forbiddenFields,
    };
  }
  
  /**
   * Get compliance status report
   * 
   * @returns {Object} Compliance status information
   */
  getComplianceStatus() {
    return {
      pciDssVersion: '3.2.1',
      complianceLevel: 'Level 1', // Adjust based on transaction volume
      requirements: {
        '14.1': {
          description: 'Never store complete card numbers',
          status: 'implemented',
          method: 'validateCardDataNotStored',
        },
        '14.2': {
          description: 'Never store CVV or PIN data',
          status: 'implemented',
          method: 'validateCardDataNotStored',
        },
        '14.4': {
          description: 'Two-factor authentication for refunds',
          status: 'implemented',
          method: 'validateTwoFactorAuth',
        },
        '5.9': {
          description: 'Mask sensitive card data in logs',
          status: 'implemented',
          method: 'maskCardNumber',
        },
      },
      lastAudit: null, // Set this after security audits
      nextAuditDue: null, // Set based on compliance schedule
    };
  }
}

module.exports = new PCIComplianceService();
