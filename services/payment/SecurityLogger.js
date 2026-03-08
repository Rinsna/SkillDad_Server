const { query } = require('../../config/postgres');

/**
 * SecurityLogger - Handles security and audit logging for payment operations
 * 
 * This service implements comprehensive audit logging as required by:
 * - Requirement 5.8: Log all payment operations with Transaction_ID
 * - Requirement 5.9: Mask sensitive card data in logs
 * - Requirement 14.5: Maintain audit logs for minimum 7 years
 * 
 * All logs are stored in PostgreSQL.
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
      const result = await query(`
        INSERT INTO audit_logs (
          action, 
          entity_id, 
          user_id, 
          ip, 
          user_agent, 
          changes, 
          severity, 
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        'payment_attempt',
        transactionId,
        userId,
        ipAddress,
        userAgent,
        JSON.stringify(this.maskSensitiveData(additionalDetails)),
        'info',
        new Date()
      ]);

      return result.rows[0];
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
      const alertRes = await query(`
        INSERT INTO security_alerts (
          severity, 
          event, 
          endpoint, 
          ip_address, 
          data, 
          description, 
          status, 
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        'high',
        'signature_verification_failed',
        endpoint,
        ipAddress,
        JSON.stringify(this.maskSensitiveData(data)),
        description,
        'open',
        new Date()
      ]);

      const alert = alertRes.rows[0];

      // Also create audit log entry
      await query(`
        INSERT INTO audit_logs (
          action, 
          ip, 
          changes, 
          severity, 
          timestamp
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        'signature_verification_failed',
        ipAddress,
        JSON.stringify({
          endpoint,
          description,
          alertId: alert.id,
        }),
        'critical',
        new Date()
      ]);

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
      const result = await query(`
        INSERT INTO audit_logs (
          action, 
          entity_id, 
          user_id, 
          changes, 
          severity, 
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        'refund_processed',
        transactionId,
        adminId,
        JSON.stringify({
          amount,
          reason,
          ...additionalDetails,
        }),
        'warning',
        new Date()
      ]);

      return result.rows[0];
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
      const result = await query(`
        INSERT INTO audit_logs (
          action, 
          entity_id, 
          user_id, 
          changes, 
          severity, 
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        'payment_success',
        transactionId,
        userId,
        JSON.stringify(this.maskSensitiveData(paymentDetails)),
        'info',
        new Date()
      ]);

      return result.rows[0];
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
      const result = await query(`
        INSERT INTO audit_logs (
          action, 
          entity_id, 
          user_id, 
          changes, 
          severity, 
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        'payment_failure',
        transactionId,
        userId,
        JSON.stringify({
          errorCode,
          errorMessage,
          ...this.maskSensitiveData(additionalDetails),
        }),
        'warning',
        new Date()
      ]);

      return result.rows[0];
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
      const adminsRes = await query("SELECT id, email, name FROM users WHERE role = 'admin'");
      const admins = adminsRes.rows;

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
      await query(`
        UPDATE security_alerts 
        SET notification_sent = TRUE, 
            notification_sent_at = $1,
            updated_at = $1
        WHERE id = $2
      `, [new Date(), alert.id]);
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
      const result = await query(`
        SELECT * FROM audit_logs 
        WHERE entity_id = $1 
        ORDER BY timestamp ASC
      `, [transactionId]);

      return result.rows;
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
        offset = 0,
        startDate,
        endDate,
      } = options;

      let queryText = 'SELECT * FROM audit_logs WHERE user_id = $1';
      const params = [userId];
      let paramCount = 1;

      if (startDate) {
        paramCount++;
        queryText += ` AND timestamp >= $${paramCount}`;
        params.push(new Date(startDate));
      }

      if (endDate) {
        paramCount++;
        queryText += ` AND timestamp <= $${paramCount}`;
        params.push(new Date(endDate));
      }

      queryText += ` ORDER BY timestamp DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(limit, offset);

      const [logsRes, countRes] = await Promise.all([
        query(queryText, params),
        query('SELECT COUNT(*) FROM audit_logs WHERE user_id = $1', [userId])
      ]);

      const total = parseInt(countRes.rows[0].count);

      return {
        logs: logsRes.rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + logsRes.rows.length < total,
        },
      };
    } catch (error) {
      console.error('Error fetching user logs:', error);
      return { logs: [], pagination: { total: 0, limit, offset: options.skip || 0, hasMore: false } };
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
        offset = 0,
      } = options;

      let queryText = 'SELECT * FROM security_alerts WHERE 1=1';
      const params = [];
      let paramCount = 0;

      if (severity) {
        paramCount++;
        queryText += ` AND severity = $${paramCount}`;
        params.push(severity);
      }

      if (status) {
        paramCount++;
        queryText += ` AND status = $${paramCount}`;
        params.push(status);
      }

      if (startDate) {
        paramCount++;
        queryText += ` AND timestamp >= $${paramCount}`;
        params.push(new Date(startDate));
      }

      if (endDate) {
        paramCount++;
        queryText += ` AND timestamp <= $${paramCount}`;
        params.push(new Date(endDate));
      }

      queryText += ` ORDER BY timestamp DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(limit, offset);

      const [alertsRes, countRes] = await Promise.all([
        query(queryText, params),
        query('SELECT COUNT(*) FROM security_alerts')
      ]);

      const total = parseInt(countRes.rows[0].count);

      return {
        alerts: alertsRes.rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + alertsRes.rows.length < total,
        },
      };
    } catch (error) {
      console.error('Error fetching security alerts:', error);
      return { alerts: [], pagination: { total: 0, limit, offset, hasMore: false } };
    }
  }
}

module.exports = new SecurityLogger();
