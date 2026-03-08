const { query } = require('../../config/postgres');

/**
 * MonitoringService for Payment Integration
 * 
 * This service tracks payment system health and performance metrics.
 */
class MonitoringService {
  constructor() {
    // In-memory storage for metrics (in production, use Redis or a time-series database)
    this.metrics = {
      paymentAttempts: [],
      apiResponseTimes: []
    };

    // Alert thresholds
    this.thresholds = {
      successRate: 90, // Alert if success rate drops below 90%
      apiResponseTime: 5000 // Alert if API response time exceeds 5 seconds (5000ms)
    };
  }

  /**
   * Track a payment attempt
   * Logs payment attempts and updates metrics
   * 
   * @param {string} transactionId - Transaction identifier
   * @param {string} status - Payment status (success, failed, pending, etc.)
   * @param {Object} metadata - Additional metadata (payment method, error details, etc.)
   * 
   * Requirements: 16.1, 16.7, 16.8, 16.9
   */
  trackPaymentAttempt(transactionId, status, metadata = {}) {
    const attempt = {
      transactionId,
      status,
      timestamp: new Date(),
      paymentMethod: metadata.paymentMethod || 'unknown',
      errorCode: metadata.errorCode || null,
      errorMessage: metadata.errorMessage || null,
      errorCategory: metadata.errorCategory || null
    };

    // Store in memory (in production, persist to database or Redis)
    this.metrics.paymentAttempts.push(attempt);

    // Keep only last 10000 attempts in memory to prevent memory issues
    if (this.metrics.paymentAttempts.length > 10000) {
      this.metrics.paymentAttempts.shift();
    }

    // Log for audit trail
    console.log(`[MonitoringService] Payment attempt tracked: ${transactionId} - ${status}`, {
      paymentMethod: attempt.paymentMethod,
      errorCode: attempt.errorCode
    });
  }

  /**
   * Track API response time
   * Logs response times for HDFC Gateway API calls
   * 
   * @param {string} endpoint - API endpoint name
   * @param {number} duration - Response time in milliseconds
   * 
   * Requirements: 16.3, 16.5
   */
  trackAPIResponseTime(endpoint, duration) {
    const record = {
      endpoint,
      duration,
      timestamp: new Date()
    };

    // Store in memory
    this.metrics.apiResponseTimes.push(record);

    // Keep only last 10000 records in memory
    if (this.metrics.apiResponseTimes.length > 10000) {
      this.metrics.apiResponseTimes.shift();
    }

    // Log slow API responses
    if (duration > this.thresholds.apiResponseTime) {
      console.warn(`[MonitoringService] ALERT: Slow API response detected - ${endpoint}: ${duration}ms`);
    }

    console.log(`[MonitoringService] API response time tracked: ${endpoint} - ${duration}ms`);
  }

  /**
   * Get payment metrics for a specific time range
   * Calculates success rate, average processing time, and failure distribution
   * 
   * @param {string} timeRange - Time range ('24h', '7d', '30d')
   * @returns {Promise<Object>} Metrics object with success rate, processing time, and failure distribution
   * 
   * Requirements: 16.1, 16.2, 16.6, 16.7, 16.8
   */
  async getPaymentMetrics(timeRange = '24h') {
    // Calculate time threshold based on range
    const now = new Date();
    let startDate;

    switch (timeRange) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Query transactions from PostgreSQL
    const res = await query(`
        SELECT status, initiated_at, completed_at, error_category, payment_method, final_amount
        FROM transactions
        WHERE initiated_at >= $1
    `, [startDate]);

    const transactions = res.rows;

    // Calculate success rate
    const totalAttempts = transactions.length;
    const successfulPayments = transactions.filter(t => t.status === 'success').length;
    const successRate = totalAttempts > 0 ? (successfulPayments / totalAttempts) * 100 : 0;

    // Calculate average processing time (from initiation to completion)
    const completedTransactions = transactions.filter(t => t.completed_at && t.initiated_at);
    const totalProcessingTime = completedTransactions.reduce((sum, t) => {
      const processingTime = new Date(t.completed_at).getTime() - new Date(t.initiated_at).getTime();
      return sum + processingTime;
    }, 0);
    const avgProcessingTime = completedTransactions.length > 0
      ? totalProcessingTime / completedTransactions.length
      : 0;

    // Calculate failure distribution by category
    const failedTransactions = transactions.filter(t => t.status === 'failed');
    const failureDistribution = {};
    failedTransactions.forEach(t => {
      const category = t.error_category || 'other';
      failureDistribution[category] = (failureDistribution[category] || 0) + 1;
    });

    // Calculate payment method distribution
    const paymentMethodDistribution = {};
    transactions.forEach(t => {
      const method = t.payment_method || 'unknown';
      paymentMethodDistribution[method] = (paymentMethodDistribution[method] || 0) + 1;
    });

    // Get most common failure reasons (top 5)
    const failureReasons = Object.entries(failureDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({
        category,
        count,
        percentage: totalAttempts > 0 ? (count / totalAttempts) * 100 : 0
      }));

    return {
      timeRange,
      startDate,
      endDate: now,
      totalAttempts,
      successfulPayments,
      failedPayments: failedTransactions.length,
      successRate: parseFloat(successRate.toFixed(2)),
      avgProcessingTime: parseFloat((avgProcessingTime / 1000).toFixed(2)), // Convert to seconds
      failureDistribution,
      failureReasons,
      paymentMethodDistribution
    };
  }

  /**
   * Check system health
   * Verifies gateway connectivity and checks if metrics are within acceptable thresholds
   * 
   * @returns {Promise<Object>} Health status object with connectivity and threshold checks
   * 
   * Requirements: 16.4, 16.5, 16.10
   */
  async checkSystemHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      checks: {}
    };

    try {
      // Check database connectivity
      const dbCheck = await this._checkDatabaseConnectivity();
      health.checks.database = dbCheck;

      // Check payment success rate (last 24 hours)
      const metrics = await this.getPaymentMetrics('24h');
      const successRateCheck = {
        status: metrics.successRate >= this.thresholds.successRate ? 'pass' : 'fail',
        value: metrics.successRate,
        threshold: this.thresholds.successRate,
        message: metrics.successRate >= this.thresholds.successRate
          ? 'Success rate is within acceptable range'
          : `ALERT: Success rate (${metrics.successRate}%) is below threshold (${this.thresholds.successRate}%)`
      };
      health.checks.successRate = successRateCheck;

      // Check API response time (average of last 100 calls)
      const recentApiCalls = this.metrics.apiResponseTimes.slice(-100);
      const avgApiResponseTime = recentApiCalls.length > 0
        ? recentApiCalls.reduce((sum, r) => sum + r.duration, 0) / recentApiCalls.length
        : 0;

      const apiResponseTimeCheck = {
        status: avgApiResponseTime <= this.thresholds.apiResponseTime ? 'pass' : 'fail',
        value: parseFloat(avgApiResponseTime.toFixed(2)),
        threshold: this.thresholds.apiResponseTime,
        message: avgApiResponseTime <= this.thresholds.apiResponseTime
          ? 'API response time is within acceptable range'
          : `ALERT: API response time (${avgApiResponseTime.toFixed(2)}ms) exceeds threshold (${this.thresholds.apiResponseTime}ms)`
      };
      health.checks.apiResponseTime = apiResponseTimeCheck;

      // Check gateway connectivity (simulate - in production, make actual API call)
      const gatewayCheck = await this._checkGatewayConnectivity();
      health.checks.gateway = gatewayCheck;

      // Determine overall health status
      const failedChecks = Object.values(health.checks).filter(check => check.status === 'fail');
      if (failedChecks.length > 0) {
        health.status = 'degraded';
      }

      // Log alerts if any checks failed
      if (health.status === 'degraded') {
        console.warn('[MonitoringService] SYSTEM HEALTH ALERT: System is degraded', {
          failedChecks: failedChecks.map(c => c.message)
        });
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
      console.error('[MonitoringService] Health check failed:', error);
    }

    return health;
  }

  /**
   * Check database connectivity
   * @private
   */
  async _checkDatabaseConnectivity() {
    try {
      // Try to count transactions (lightweight query)
      await query('SELECT COUNT(*) FROM transactions LIMIT 1');
      return {
        status: 'pass',
        message: 'PostgreSQL database is connected and responsive'
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `PostgreSQL database connectivity issue: ${error.message}`
      };
    }
  }

  /**
   * Check gateway connectivity
   * @private
   */
  async _checkGatewayConnectivity() {
    // In production, this would make an actual API call to Razorpay API
    // For now, we'll simulate based on recent API response times
    const recentApiCalls = this.metrics.apiResponseTimes.slice(-10);

    if (recentApiCalls.length === 0) {
      return {
        status: 'unknown',
        message: 'No recent API calls to determine gateway connectivity'
      };
    }

    // Check if any recent calls failed (would be tracked separately in production)
    const avgResponseTime = recentApiCalls.reduce((sum, r) => sum + r.duration, 0) / recentApiCalls.length;

    if (avgResponseTime > this.thresholds.apiResponseTime * 2) {
      return {
        status: 'fail',
        message: 'Gateway appears to be slow or unresponsive'
      };
    }

    return {
      status: 'pass',
      message: 'Gateway is connected and responsive'
    };
  }

  /**
   * Get real-time transaction monitoring data
   * Returns recent transactions for admin dashboard
   * 
   * @param {number} limit - Number of recent transactions to return
   * @returns {Promise<Array>} Array of recent transactions
   * 
   * Requirements: 16.10
   */
  async getRecentTransactions(limit = 50) {
    try {
      const res = await query(`
        SELECT 
          t.transaction_id, 
          t.status, 
          t.final_amount, 
          t.payment_method, 
          t.initiated_at, 
          t.completed_at, 
          t.error_message,
          u.name as student_name,
          u.email as student_email,
          c.title as course_title
        FROM transactions t
        LEFT JOIN users u ON t.student_id = u.id
        LEFT JOIN courses c ON t.course_id = c.id
        ORDER BY t.initiated_at DESC
        LIMIT $1
      `, [limit]);

      return res.rows.map(t => ({
        transactionId: t.transaction_id,
        student: { name: t.student_name, email: t.student_email },
        course: { title: t.course_title },
        status: t.status,
        amount: `₹${parseFloat(t.final_amount).toFixed(2)}`,
        paymentMethod: t.payment_method,
        initiatedAt: t.initiated_at,
        completedAt: t.completed_at,
        errorMessage: t.error_message
      }));
    } catch (error) {
      console.error('[MonitoringService] Error fetching recent transactions:', error);
      throw error;
    }
  }

  /**
   * Get active system alerts
   * 
   * @returns {Promise<Array>} Array of active alerts
   */
  async getActiveAlerts() {
    const health = await this.checkSystemHealth();
    const alerts = [];

    Object.entries(health.checks).forEach(([key, check]) => {
      if (check.status === 'fail') {
        alerts.push({
          type: key,
          severity: 'high',
          message: check.message,
          timestamp: health.timestamp
        });
      }
    });

    // Also check for any security alerts in PostgreSQL
    try {
      const res = await query(`
        SELECT alert_type, severity, message, created_at
        FROM security_alerts
        WHERE resolved = false
        ORDER BY created_at DESC
        LIMIT 10
      `);

      res.rows.forEach(row => {
        alerts.push({
          type: row.alert_type,
          severity: row.severity,
          message: row.message,
          timestamp: row.created_at
        });
      });
    } catch (error) {
      console.error('[MonitoringService] Error fetching security alerts:', error);
    }

    return alerts;
  }

  /**
   * Get realtime transaction summary
   * 
   * @param {number} limit - Number of recent transactions
   * @returns {Promise<Object>} Summary with transactions and status counts
   */
  async getRealtimeSummary(limit = 20) {
    const recentTransactions = await this.getRecentTransactions(limit);

    // Get counts by status from PostgreSQL for last 24h
    const res = await query(`
        SELECT status, COUNT(*) as count
        FROM transactions
        WHERE initiated_at >= NOW() - INTERVAL '24 hours'
        GROUP BY status
    `);

    const statusCounts = res.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {});

    return {
      recentTransactions,
      statusCounts
    };
  }

  /**
   * Get performance metrics
   * 
   * @param {string} timeRange - Time range
   * @returns {Promise<Object>} Performance metrics
   */
  async getPerformanceMetrics(timeRange = '24h') {
    let interval = '24 hours';
    if (timeRange === '7d') interval = '7 days';
    if (timeRange === '30d') interval = '30 days';

    // Calculate processing times from PostgreSQL
    const res = await query(`
        SELECT 
            AVG(EXTRACT(EPOCH FROM (completed_at - initiated_at))) as avg_time,
            MIN(EXTRACT(EPOCH FROM (completed_at - initiated_at))) as min_time,
            MAX(EXTRACT(EPOCH FROM (completed_at - initiated_at))) as max_time
        FROM transactions
        WHERE status = 'success' 
        AND completed_at IS NOT NULL 
        AND initiated_at >= NOW() - INTERVAL '${interval}'
    `);

    const stats = res.rows[0];

    // Get payment method distribution
    const distRes = await query(`
        SELECT 
            payment_method, 
            COUNT(*) as count,
            SUM(final_amount) as total_amount
        FROM transactions
        WHERE status = 'success'
        AND initiated_at >= NOW() - INTERVAL '${interval}'
        GROUP BY payment_method
    `);

    return {
      timeRange,
      processingTime: {
        average: parseFloat(stats.avg_time || 0).toFixed(2),
        min: parseFloat(stats.min_time || 0).toFixed(2),
        max: parseFloat(stats.max_time || 0).toFixed(2),
        unit: 'seconds'
      },
      paymentMethodDistribution: distRes.rows.map(row => ({
        method: row.payment_method || 'unknown',
        count: parseInt(row.count),
        totalAmount: parseFloat(row.total_amount || 0).toFixed(2)
      }))
    };
  }

  /**
   * Get failure analysis
   * 
   * @param {string} timeRange - Time range
   * @returns {Promise<Object>} Failure analysis metrics
   */
  async getFailureAnalysis(timeRange = '24h') {
    let interval = '24 hours';
    if (timeRange === '7d') interval = '7 days';
    if (timeRange === '30d') interval = '30 days';

    // Get failure reason distribution
    const distRes = await query(`
        SELECT 
            error_category, 
            COUNT(*) as count,
            array_agg(error_message ORDER BY initiated_at DESC) as examples
        FROM transactions
        WHERE status = 'failed'
        AND initiated_at >= NOW() - INTERVAL '${interval}'
        GROUP BY error_category
    `);

    // Get recent failed transactions
    const recentFailuresRes = await query(`
        SELECT 
            t.transaction_id, 
            t.status, 
            t.final_amount, 
            t.error_category, 
            t.error_message, 
            t.initiated_at,
            u.name as student_name,
            u.email as student_email,
            c.title as course_title
        FROM transactions t
        LEFT JOIN users u ON t.student_id = u.id
        LEFT JOIN courses c ON t.course_id = c.id
        WHERE t.status = 'failed'
        AND t.initiated_at >= NOW() - INTERVAL '${interval}'
        ORDER BY t.initiated_at DESC
        LIMIT 10
    `);

    return {
      timeRange,
      reasonDistribution: distRes.rows.map(row => ({
        category: row.error_category || 'unknown',
        count: parseInt(row.count),
        exampleMessages: (row.examples || []).slice(0, 3)
      })),
      recentFailures: recentFailuresRes.rows.map(t => ({
        transactionId: t.transaction_id,
        student: { name: t.student_name, email: t.student_email },
        course: { title: t.course_title },
        amount: parseFloat(t.final_amount).toFixed(2),
        errorCategory: t.error_category,
        errorMessage: t.error_message,
        initiatedAt: t.initiated_at
      }))
    };
  }

  /**
   * Log API error for monitoring
   * 
   * @param {string} endpoint - API endpoint that failed
   * @param {string} errorCode - Error code from gateway
   * @param {string} errorMessage - Error message from gateway
   * 
   * Requirements: 16.9
   */
  logAPIError(endpoint, errorCode, errorMessage) {
    const errorLog = {
      endpoint,
      errorCode,
      errorMessage,
      timestamp: new Date()
    };

    console.error('[MonitoringService] API Error:', errorLog);

    // In production, persist to database or logging service
    // For now, just log to console
  }

  /**
   * Clear old metrics from memory
   * Should be called periodically to prevent memory issues
   */
  clearOldMetrics() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Clear old payment attempts
    this.metrics.paymentAttempts = this.metrics.paymentAttempts.filter(
      attempt => attempt.timestamp > oneDayAgo
    );

    // Clear old API response times
    this.metrics.apiResponseTimes = this.metrics.apiResponseTimes.filter(
      record => record.timestamp > oneDayAgo
    );

    console.log('[MonitoringService] Old metrics cleared from memory');
  }
}

// Export singleton instance
module.exports = new MonitoringService();
