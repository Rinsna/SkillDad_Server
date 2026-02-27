const AuditLog = require('../../models/payment/AuditLog');
const SecurityAlert = require('../../models/payment/SecurityAlert');

/**
 * SecurityLogger - Handles security and audit logging for payment operations
 * 
 * This service implements comprehensive audit logging as required by:
 * - Requirement 5.8: Log all payment operations with Transaction_ID
 * - Requirement 5.9: Mask sensitive card data in logs
 * - Requirement 14.5: Maintain audit logs for minimum 7 years
 * 
 * All logs are stored in MongoDB with automatic TTL-based deletion after 7 years.
 */
class SecurityLogger {
  /**
   * Log a payment attempt
   * 
   * @param {string} transactionId - Transaction ID
   * @param {string} userId - User ID who initiated the payment
   * @param {string} ipAddress - IP address of the request
   * @param {string} userAgent - User agent string
   * @param {Object} additionalDetails - Additional details to log
   * @returns {Promise<Object>} Created audit log entry
   */
  async logPaymentAttempt(transactionId, userId, ipAddress, userAgent, additionalDetails = {}) {
    try {
      const auditLog = await AuditLog.create({
        event: 'payment_attempt',
        transactionId,
        userId,
        ipAddress,
        userAgent,
        details: this.maskSensitiveData(additionalDetails),
        severity: 'info',
        timestamp: new Date(),
      });
      
      return auditLog;
    } catch (error) {
      console.error('Error logging payment attempt:', error);
      // Don't throw - logging failures shouldn't break payment flow
      return null;
    }
  }
  
  /**
   * Log a signature verification failure (security alert)
   * 
   * @param {string} endpoint - API endpoint where failure occurred
   * @param {Object} data - Request data (will be masked)
   * @param {string} ipAddress - IP address of the request
   * @param {string} description - Description of the failure
   * @returns {Promise<Object>} Created security alert
   */
  async logSignatureFailure(endpoint, data, ipAddress, description = 'Signature verification failed') {
    try {
      // Create security alert
      const alert = await SecurityAlert.create({
        severity: 'high',
        event: 'signature_verification_failed',
        endpoint,
        ipAddress,
        data: this.maskSensitiveData(data),
        description,
        status: 'open',
        timestamp: new Date(),
      });
      
      // Also create audit log entry
      await AuditLog.create({
        event: 'signature_verification_failed',
        ipAddress,
        details: {
          endpoint,
          description,
          alertId: alert._id,
        },
        severity: 'critical',
        timestamp: new Date(),
      });
      
      // Send alert notification (async, don't wait)
      this.sendSecurityAlert(alert).catch(err => {
        console.error('Error sending security alert:', err);
      });
      
      return alert;
    } catch (error) {
      console.error('Error logging signature failure:', error);
      return null;
    }
  }
  
  /**
   * Log a refund operation
   * 
   * @param {string} transactionId - Original transaction ID
   * @param {string} adminId - Admin user ID who processed the refund
   * @param {number} amount - Refund amount
   * @param {string} reason - Reason for refund
   * @param {Object} additionalDetails - Additional details
   * @returns {Promise<Object>} Created audit log entry
   */
  async logRefundOperation(transactionId, adminId, amount, reason, additionalDetails = {}) {
    try {
      const auditLog = await AuditLog.create({
        event: 'refund_processed',
        transactionId,
        userId: adminId,
        details: {
          amount,
          reason,
          ...additionalDetails,
        },
        severity: 'warning',
        timestamp: new Date(),
      });
      
      return auditLog;
    } catch (error) {
      console.error('Error logging refund operation:', error);
      return null;
    }
  }
  
  /**
   * Log a payment success
   * 
   * @param {string} transactionId - Transaction ID
   * @param {string} userId - User ID
   * @param {Object} paymentDetails - Payment details (will be masked)
   * @returns {Promise<Object>} Created audit log entry
   */
  async logPaymentSuccess(transactionId, userId, paymentDetails = {}) {
    try {
      const auditLog = await AuditLog.create({
        event: 'payment_success',
        transactionId,
        userId,
        details: this.maskSensitiveData(paymentDetails),
        severity: 'info',
        timestamp: new Date(),
      });
      
      return auditLog;
    } catch (error) {
      console.error('Error logging payment success:', error);
      return null;
    }
  }
  
  /**
   * Log a payment failure
   * 
   * @param {string} transactionId - Transaction ID
   * @param {string} userId - User ID
   * @param {string} errorCode - Error code
   * @param {string} errorMessage - Error message
   * @param {Object} additionalDetails - Additional details
   * @returns {Promise<Object>} Created audit log entry
   */
  async logPaymentFailure(transactionId, userId, errorCode, errorMessage, additionalDetails = {}) {
    try {
      const auditLog = await AuditLog.create({
        event: 'payment_failure',
        transactionId,
        userId,
        details: {
          errorCode,
          errorMessage,
          ...this.maskSensitiveData(additionalDetails),
        },
        severity: 'warning',
        timestamp: new Date(),
      });
      
      return auditLog;
    } catch (error) {
      console.error('Error logging payment failure:', error);
      return null;
    }
  }
  
  /**
   * Mask sensitive data in logs
   * 
   * Implements Requirement 5.9: Mask sensitive card data in logs
   * - Shows only last 4 digits of card numbers
   * - Removes CVV, PIN, and other sensitive fields
   * 
   * @param {Object} data - Data object to mask
   * @returns {Object} Masked data object
   */
  maskSensitiveData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    // Create a deep copy to avoid modifying original
    const masked = JSON.parse(JSON.stringify(data));
    
    // Fields to completely remove
    const fieldsToRemove = [
      'cvv',
      'cvc',
      'pin',
      'password',
      'apiKey',
      'apiSecret',
      'encryptionKey',
      'cardPin',
      'otp',
      'token',
      'accessToken',
      'refreshToken',
    ];
    
    // Fields to mask (show only last 4 digits)
    const fieldsToMask = [
      'cardNumber',
      'accountNumber',
      'iban',
    ];
    
    // Recursively process the object
    const processObject = (obj) => {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }
      
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const lowerKey = key.toLowerCase();
          
          // Remove sensitive fields
          if (fieldsToRemove.some(field => lowerKey.includes(field.toLowerCase()))) {
            delete obj[key];
            continue;
          }
          
          // Mask card numbers and similar fields
          if (fieldsToMask.some(field => lowerKey.includes(field.toLowerCase()))) {
            if (typeof obj[key] === 'string' && obj[key].length >= 4) {
              obj[key] = `****${obj[key].slice(-4)}`;
            } else {
              obj[key] = '****';
            }
            continue;
          }
          
          // Recursively process nested objects and arrays
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            if (Array.isArray(obj[key])) {
              obj[key] = obj[key].map(item => processObject(item));
            } else {
              processObject(obj[key]);
            }
          }
        }
      }
      
      return obj;
    };
    
    return processObject(masked);
  }
  
  /**
   * Send security alert notification to administrators
   * 
   * @param {Object} alert - Security alert object
   * @returns {Promise<void>}
   * @private
   */
  async sendSecurityAlert(alert) {
    try {
      // Import email service
      const sendEmail = require('../../utils/sendEmail');
      
      // Get admin users
      const User = require('../../models/userModel');
      const admins = await User.find({ role: 'admin' }).select('email name');
      
      if (admins.length === 0) {
        console.warn('No admin users found to send security alert');
        return;
      }
      
      // Prepare email content
      const subject = `Security Alert: ${alert.event}`;
      const message = `
        <h2>Security Alert</h2>
        <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
        <p><strong>Event:</strong> ${alert.event}</p>
        <p><strong>Time:</strong> ${alert.timestamp.toISOString()}</p>
        <p><strong>IP Address:</strong> ${alert.ipAddress || 'Unknown'}</p>
        <p><strong>Endpoint:</strong> ${alert.endpoint || 'N/A'}</p>
        <p><strong>Description:</strong> ${alert.description || 'No description provided'}</p>
        <hr>
        <p>Please investigate this security alert immediately.</p>
        <p>Alert ID: ${alert._id}</p>
      `;
      
      // Send email to all admins
      for (const admin of admins) {
        try {
          await sendEmail({
            email: admin.email,
            subject,
            message,
          });
        } catch (emailError) {
          console.error(`Failed to send alert to ${admin.email}:`, emailError);
        }
      }
      
      // Mark notification as sent
      await SecurityAlert.updateOne(
        { _id: alert._id },
        {
          notificationSent: true,
          notificationSentAt: new Date(),
        }
      );
    } catch (error) {
      console.error('Error sending security alert:', error);
      // Don't throw - notification failures shouldn't break the flow
    }
  }
  
  /**
   * Get audit logs for a specific transaction
   * 
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Array>} Array of audit log entries
   */
  async getTransactionLogs(transactionId) {
    try {
      const logs = await AuditLog.find({ transactionId })
        .sort({ timestamp: 1 })
        .lean();
      
      return logs;
    } catch (error) {
      console.error('Error fetching transaction logs:', error);
      return [];
    }
  }
  
  /**
   * Get audit logs for a specific user
   * 
   * @param {string} userId - User ID
   * @param {Object} options - Query options (limit, skip, startDate, endDate)
   * @returns {Promise<Object>} Object with logs and pagination info
   */
  async getUserLogs(userId, options = {}) {
    try {
      const {
        limit = 50,
        skip = 0,
        startDate,
        endDate,
      } = options;
      
      const query = { userId };
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }
      
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ timestamp: -1 })
          .limit(limit)
          .skip(skip)
          .lean(),
        AuditLog.countDocuments(query),
      ]);
      
      return {
        logs,
        pagination: {
          total,
          limit,
          skip,
          hasMore: skip + logs.length < total,
        },
      };
    } catch (error) {
      console.error('Error fetching user logs:', error);
      return { logs: [], pagination: { total: 0, limit, skip, hasMore: false } };
    }
  }
  
  /**
   * Get security alerts
   * 
   * @param {Object} filters - Filter options (severity, status, startDate, endDate)
   * @param {Object} options - Query options (limit, skip)
   * @returns {Promise<Object>} Object with alerts and pagination info
   */
  async getSecurityAlerts(filters = {}, options = {}) {
    try {
      const {
        severity,
        status,
        startDate,
        endDate,
      } = filters;
      
      const {
        limit = 50,
        skip = 0,
      } = options;
      
      const query = {};
      
      if (severity) query.severity = severity;
      if (status) query.status = status;
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }
      
      const [alerts, total] = await Promise.all([
        SecurityAlert.find(query)
          .sort({ timestamp: -1 })
          .limit(limit)
          .skip(skip)
          .populate('resolvedBy', 'name email')
          .lean(),
        SecurityAlert.countDocuments(query),
      ]);
      
      return {
        alerts,
        pagination: {
          total,
          limit,
          skip,
          hasMore: skip + alerts.length < total,
        },
      };
    } catch (error) {
      console.error('Error fetching security alerts:', error);
      return { alerts: [], pagination: { total: 0, limit, skip, hasMore: false } };
    }
  }
}

module.exports = new SecurityLogger();
