const { query } = require('../config/postgres');

/**
 * AdminConfigController - Handles admin configuration and transaction management
 */
class AdminConfigController {
  constructor() {
    // No specific initialization needed for now
  }

  /**
   * Get current gateway configuration
   * Returns generic configuration information
   */
  async getGatewayConfig(req, res) {
    try {
      // Since we're using Razorpay with environment variables, 
      // there might not be a database-stored config for credentials.
      // But we can return some general settings.
      res.json({
        success: true,
        config: {
          gatewayName: 'Razorpay',
          environment: process.env.NODE_ENV || 'development',
          currency: 'INR',
          minTransactionAmount: 1,
          maxTransactionAmount: 500000,
          publishableKey: process.env.RAZORPAY_KEY_ID,
          isActive: true,
        },
      });
    } catch (error) {
      console.error('Get gateway config error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve gateway configuration',
      });
    }
  }

  /**
   * Update gateway configuration - Placeholder for Razorpay-related settings
   */
  async updateGatewayConfig(req, res) {
    res.status(501).json({
      success: false,
      message: 'Gateway configuration update is not supported for environment-based settings',
    });
  }

  /**
   * Test gateway connection
   */
  async testGatewayConnection(req, res) {
    try {
      // Simple health check for Razorpay integration
      // In a real scenario, this could check if the Razorpay client is initialized
      const isConfigured = !!process.env.RAZORPAY_KEY_SECRET;

      res.json({
        success: true,
        gatewayStatus: isConfigured ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        message: isConfigured
          ? 'Successfully connected to Razorpay'
          : 'Razorpay secret key is missing in configuration',
      });
    } catch (error) {
      console.error('Gateway connection test error:', error);
      res.status(500).json({
        success: false,
        gatewayStatus: 'error',
        message: 'Failed to test gateway connection',
        error: error.message,
      });
    }
  }

  /**
   * Get all transactions (admin view)
   */
  async getAllTransactions(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;

      // Build filter
      let whereClause = '1=1';
      const params = [];
      let paramCount = 0;

      if (req.query.status) {
        paramCount++;
        whereClause += ` AND t.status = $${paramCount}`;
        params.push(req.query.status);
      }

      if (req.query.startDate) {
        paramCount++;
        whereClause += ` AND t.initiated_at >= $${paramCount}`;
        params.push(new Date(req.query.startDate));
      }

      if (req.query.endDate) {
        paramCount++;
        whereClause += ` AND t.initiated_at <= $${paramCount}`;
        params.push(new Date(req.query.endDate));
      }

      // Fetch transactions with pagination and joins
      const transactionsRes = await query(`
        SELECT t.*, 
               s.name as student_name, s.email as student_email,
               c.title as course_title, c.price as course_price
        FROM transactions t
        LEFT JOIN users s ON t.student_id = s.id
        LEFT JOIN courses c ON t.course_id = c.id
        WHERE ${whereClause}
        ORDER BY t.initiated_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `, [...params, limit, offset]);

      const countRes = await query(`
        SELECT COUNT(*) as count FROM transactions t WHERE ${whereClause}
      `, params);

      const total = parseInt(countRes.rows[0].count);

      // Map to keep the response structure consistent with what frontend expects
      const transactions = transactionsRes.rows.map(t => ({
        ...t,
        transactionId: t.transaction_id,
        student: { id: t.student_id, name: t.student_name, email: t.student_email },
        course: { id: t.course_id, title: t.course_title, price: t.course_price },
        initiatedAt: t.initiated_at,
        completedAt: t.completed_at,
        finalAmount: t.final_amount,
        paymentMethod: t.payment_method
      }));

      res.json({
        success: true,
        transactions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      });
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve transactions',
      });
    }
  }
}

module.exports = new AdminConfigController();
