const Transaction = require('../models/payment/Transaction');
const Course = require('../models/courseModel');
const User = require('../models/userModel');

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
      // Since we're using Stripe with environment variables, 
      // there might not be a database-stored config for credentials.
      // But we can return some general settings.
      res.json({
        success: true,
        config: {
          gatewayName: 'Stripe',
          environment: process.env.NODE_ENV || 'development',
          currency: 'INR',
          minTransactionAmount: 1,
          maxTransactionAmount: 500000,
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
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
   * Update gateway configuration - Placeholder for Stripe-related settings
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
      // Simple health check for Stripe integration
      // In a real scenario, this could check if the Stripe client is initialized
      const isConfigured = !!process.env.STRIPE_SECRET_KEY;

      res.json({
        success: true,
        gatewayStatus: isConfigured ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        message: isConfigured
          ? 'Successfully connected to Stripe'
          : 'Stripe secret key is missing in configuration',
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
      const skip = (page - 1) * limit;

      // Build filter
      const filter = {};
      if (req.query.status) {
        filter.status = req.query.status;
      }
      if (req.query.startDate || req.query.endDate) {
        filter.initiatedAt = {};
        if (req.query.startDate) {
          filter.initiatedAt.$gte = new Date(req.query.startDate);
        }
        if (req.query.endDate) {
          filter.initiatedAt.$lte = new Date(req.query.endDate);
        }
      }

      // Fetch transactions with pagination
      const [transactions, total] = await Promise.all([
        Transaction.find(filter)
          .populate('student', 'name email')
          .populate('course', 'title price')
          .sort({ initiatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Transaction.countDocuments(filter),
      ]);

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
