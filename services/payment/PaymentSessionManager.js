/**
 * PaymentSessionManager.js
 * 
 * Manages payment session lifecycle including creation, validation, and expiration.
 * Implements secure session ID generation and expiration checking.
 * 
 * Requirements: 1.1, 1.7, 1.8, 14.6
 */

const crypto = require('crypto');
const { query } = require('../../config/postgres');

/**
 * PaymentSessionManager
 * 
 * Handles payment session management with secure session ID generation,
 * expiration checking, and session lifecycle operations.
 */
class PaymentSessionManager {
  constructor() {
    // Session timeout: 15 minutes (in milliseconds)
    this.sessionTimeout = 15 * 60 * 1000;
  }

  /**
   * Create a new payment session
   * 
   * Generates a cryptographically secure session ID and creates a PaymentSession
   * record in the database with a 15-minute expiration time.
   * 
   * @param {Object} transactionData - Transaction data for the session
   * @param {string} transactionData.transactionId - Unique transaction ID
   * @param {string} transactionData.student - Student ID (ObjectId)
   * @param {string} transactionData.course - Course ID (ObjectId)
   * @param {number} transactionData.amount - Payment amount
   * @returns {Promise<Object>} Created payment session
   * @throws {Error} If required fields are missing or session creation fails
   * 
   * Requirements: 1.1, 1.7, 1.8, 14.6
   */
  async createSession(transactionData) {
    // Validate required fields
    if (!transactionData.transactionId) {
      throw new Error('Transaction ID is required');
    }
    if (!transactionData.student) {
      throw new Error('Student ID is required');
    }
    if (!transactionData.course) {
      throw new Error('Course ID is required');
    }
    if (!transactionData.amount) {
      throw new Error('Amount is required');
    }

    // Generate secure session ID
    const sessionId = this.generateSecureSessionId();

    // Calculate expiration time (15 minutes from now)
    const expiresAt = new Date(Date.now() + this.sessionTimeout);

    // Create payment session in PostgreSQL
    const res = await query(`
        INSERT INTO payment_sessions (
          session_id, 
          transaction_id, 
          student_id, 
          course_id, 
          amount, 
          status, 
          expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `, [
      sessionId,
      transactionData.transactionId,
      transactionData.student,
      transactionData.course,
      transactionData.amount,
      'active',
      expiresAt
    ]);

    return res.rows[0];
  }

  /**
   * Generate a cryptographically secure session ID
   * 
   * Uses crypto.randomBytes to generate a secure random session ID
   * with the format: SES_<20_uppercase_hex_chars>
   * 
   * @returns {string} Secure session ID
   * 
   * Requirements: 1.1
   */
  generateSecureSessionId() {
    // Generate 32 random bytes (256 bits)
    const randomBytes = crypto.randomBytes(32);

    // Convert to hex and take first 20 characters, convert to uppercase
    const hexString = randomBytes.toString('hex').substring(0, 20).toUpperCase();

    // Return with SES_ prefix
    return `SES_${hexString}`;
  }

  /**
   * Validate a payment session
   * 
   * Checks if a session exists, is active, and has not expired.
   * 
   * @param {string} sessionId - Session ID to validate
   * @returns {Promise<Object>} Valid session object
   * @throws {Error} If session is invalid, expired, or not found
   * 
   * Requirements: 1.7, 14.6
   */
  async validateSession(sessionId) {
    // Find session by ID in PostgreSQL
    const res = await query('SELECT * FROM payment_sessions WHERE session_id = $1', [sessionId]);
    const session = res.rows[0];

    // Check if session exists
    if (!session) {
      throw new Error('Session not found');
    }

    // Check if session is active
    if (session.status !== 'active') {
      throw new Error(`Session is ${session.status}`);
    }

    // Check if session has expired
    const now = new Date();
    if (now > new Date(session.expires_at)) {
      // Mark session as expired
      await this.expireSession(sessionId);
      throw new Error('Session has expired');
    }

    return session;
  }

  /**
   * Expire a payment session
   * 
   * Marks a session as expired in the database.
   * 
   * @param {string} sessionId - Session ID to expire
   * @returns {Promise<Object>} Updated session object
   * @throws {Error} If session is not found
   * 
   * Requirements: 1.7, 14.6
   */
  async expireSession(sessionId) {
    // Find and update session status to expired in PostgreSQL
    const res = await query(`
      UPDATE payment_sessions 
      SET status = 'expired', 
          updated_at = NOW() 
      WHERE session_id = $1 
      RETURNING *
    `, [sessionId]);

    const session = res.rows[0];

    if (!session) {
      throw new Error('Session not found');
    }

    return session;
  }

  /**
   * Mark a session as completed
   * 
   * Updates session status to completed when payment is successful.
   * 
   * @param {string} sessionId - Session ID to mark as completed
   * @returns {Promise<Object>} Updated session object
   * @throws {Error} If session is not found
   */
  async completeSession(sessionId) {
    const res = await query(`
      UPDATE payment_sessions 
      SET status = 'completed', 
          completed_at = $1,
          updated_at = NOW() 
      WHERE session_id = $2 
      RETURNING *
    `, [new Date(), sessionId]);

    const session = res.rows[0];

    if (!session) {
      throw new Error('Session not found');
    }

    return session;
  }

  /**
   * Cancel a payment session
   * 
   * Marks a session as cancelled when payment is cancelled by user.
   * 
   * @param {string} sessionId - Session ID to cancel
   * @returns {Promise<Object>} Updated session object
   * @throws {Error} If session is not found
   */
  async cancelSession(sessionId) {
    const res = await query(`
      UPDATE payment_sessions 
      SET status = 'cancelled', 
          cancelled_at = $1,
          updated_at = NOW() 
      WHERE session_id = $2 
      RETURNING *
    `, [new Date(), sessionId]);

    const session = res.rows[0];

    if (!session) {
      throw new Error('Session not found');
    }

    return session;
  }

  /**
   * Get session by ID
   * 
   * Retrieves a session without validation checks.
   * 
   * @param {string} sessionId - Session ID to retrieve
   * @returns {Promise<Object|null>} Session object or null if not found
   */
  async getSession(sessionId) {
    const res = await query('SELECT * FROM payment_sessions WHERE session_id = $1', [sessionId]);
    return res.rows[0] || null;
  }

  /**
   * Get active sessions for a student
   * 
   * Retrieves all active, non-expired sessions for a specific student.
   * 
   * @param {string} studentId - Student ID (ObjectId)
   * @returns {Promise<Array>} Array of active sessions
   */
  async getActiveSessionsForStudent(studentId) {
    const now = new Date();

    const res = await query(`
      SELECT * FROM payment_sessions 
      WHERE student_id = $1 AND status = 'active' AND expires_at > $2 
      ORDER BY created_at DESC
    `, [studentId, now]);

    return res.rows;
  }

  /**
   * Cleanup expired sessions
   * 
   * Marks all expired sessions as expired in the database.
   * This can be run as a scheduled job.
   * 
   * @returns {Promise<Object>} Update result with count of modified sessions
   */
  async cleanupExpiredSessions() {
    const now = new Date();

    const res = await query(`
      UPDATE payment_sessions 
      SET status = 'expired', 
          updated_at = NOW() 
      WHERE status = 'active' AND expires_at < $1
      RETURNING id
    `, [now]);

    return {
      modifiedCount: res.rowCount,
      message: `Expired ${res.rowCount} sessions`
    };
  }

  /**
   * Get session statistics
   * 
   * Returns statistics about payment sessions.
   * 
   * @returns {Promise<Object>} Session statistics
   */
  async getStatistics() {
    const res = await query(`
      SELECT status, COUNT(*) as count 
      FROM payment_sessions 
      GROUP BY status
    `);

    const result = {
      total: 0,
      active: 0,
      completed: 0,
      expired: 0,
      cancelled: 0
    };

    res.rows.forEach(stat => {
      result[stat.status] = parseInt(stat.count);
      result.total += parseInt(stat.count);
    });

    return result;
  }
}

module.exports = PaymentSessionManager;
