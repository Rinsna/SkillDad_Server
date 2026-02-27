const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');

// Import authentication middleware
const { protect, authorize } = require('../middleware/authMiddleware');

// Import validation rules
const { metricsValidation } = require('../middleware/paymentValidation');

// Import rate limiting middleware
const { monitoringLimiter } = require('../middleware/rateLimiting');

/**
 * Validation error handler middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
      })),
    });
  }
  next();
};

// ============================================================================
// MONITORING ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/monitoring/metrics
 * @desc    Get payment system metrics
 * @access  Private (Admin only)
 * @rateLimit 20 requests per minute
 */
router.get(
  '/metrics',
  protect,
  authorize('admin'),
  monitoringLimiter,
  metricsValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const MonitoringService = require('../services/payment/MonitoringService');
      const monitoringService = new MonitoringService();

      const timeRange = req.query.timeRange || '24h';

      // Get metrics for the specified time range
      const metrics = await monitoringService.getPaymentMetrics(timeRange);

      res.json({
        success: true,
        metrics,
      });
    } catch (error) {
      console.error('Get metrics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve payment metrics',
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/admin/monitoring/health
 * @desc    Get system health status
 * @access  Private (Admin only)
 * @rateLimit 20 requests per minute
 */
router.get(
  '/health',
  protect,
  authorize('admin'),
  monitoringLimiter,
  async (req, res) => {
    try {
      const MonitoringService = require('../services/payment/MonitoringService');
      const monitoringService = new MonitoringService();

      // Check system health
      const health = await monitoringService.checkSystemHealth();

      res.json({
        success: true,
        health,
      });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check system health',
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/admin/monitoring/alerts
 * @desc    Get active system alerts
 * @access  Private (Admin only)
 * @rateLimit 20 requests per minute
 */
router.get(
  '/alerts',
  protect,
  authorize('admin'),
  monitoringLimiter,
  async (req, res) => {
    try {
      const MonitoringService = require('../services/payment/MonitoringService');
      const monitoringService = new MonitoringService();

      // Get active alerts
      const alerts = await monitoringService.getActiveAlerts();

      res.json({
        success: true,
        alerts,
      });
    } catch (error) {
      console.error('Get alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve alerts',
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/admin/monitoring/transactions/realtime
 * @desc    Get real-time transaction monitoring data
 * @access  Private (Admin only)
 * @rateLimit 20 requests per minute
 */
router.get(
  '/transactions/realtime',
  protect,
  authorize('admin'),
  monitoringLimiter,
  async (req, res) => {
    try {
      const Transaction = require('../models/payment/Transaction');

      const limit = parseInt(req.query.limit) || 20;

      // Get recent transactions
      const recentTransactions = await Transaction.find()
        .populate('student', 'name email')
        .populate('course', 'title')
        .sort({ initiatedAt: -1 })
        .limit(limit)
        .select('transactionId status finalAmount paymentMethod initiatedAt completedAt')
        .lean();

      // Get counts by status
      const statusCounts = await Transaction.aggregate([
        {
          $match: {
            initiatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      res.json({
        success: true,
        recentTransactions: recentTransactions.map(txn => ({
          transactionId: txn.transactionId,
          student: txn.student,
          course: txn.course,
          amount: parseFloat(txn.finalAmount.toString()).toFixed(2),
          status: txn.status,
          paymentMethod: txn.paymentMethod,
          initiatedAt: txn.initiatedAt,
          completedAt: txn.completedAt,
        })),
        statusCounts: statusCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      });
    } catch (error) {
      console.error('Get realtime transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve realtime transaction data',
      });
    }
  }
);

/**
 * @route   GET /api/admin/monitoring/performance
 * @desc    Get payment system performance metrics
 * @access  Private (Admin only)
 * @rateLimit 20 requests per minute
 */
router.get(
  '/performance',
  protect,
  authorize('admin'),
  monitoringLimiter,
  async (req, res) => {
    try {
      const Transaction = require('../models/payment/Transaction');

      const timeRange = req.query.timeRange || '24h';
      let startDate;

      switch (timeRange) {
        case '24h':
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      // Calculate average processing time
      const completedTransactions = await Transaction.find({
        status: 'success',
        initiatedAt: { $gte: startDate },
        completedAt: { $exists: true },
      }).select('initiatedAt completedAt');

      const processingTimes = completedTransactions.map(txn => {
        return (new Date(txn.completedAt) - new Date(txn.initiatedAt)) / 1000; // in seconds
      });

      const avgProcessingTime = processingTimes.length > 0
        ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
        : 0;

      const minProcessingTime = processingTimes.length > 0
        ? Math.min(...processingTimes)
        : 0;

      const maxProcessingTime = processingTimes.length > 0
        ? Math.max(...processingTimes)
        : 0;

      // Get payment method distribution
      const paymentMethodDistribution = await Transaction.aggregate([
        {
          $match: {
            status: 'success',
            initiatedAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: '$paymentMethod',
            count: { $sum: 1 },
            totalAmount: { $sum: { $toDouble: '$finalAmount' } },
          },
        },
      ]);

      res.json({
        success: true,
        performance: {
          timeRange,
          processingTime: {
            average: avgProcessingTime.toFixed(2),
            min: minProcessingTime.toFixed(2),
            max: maxProcessingTime.toFixed(2),
            unit: 'seconds',
          },
          paymentMethodDistribution: paymentMethodDistribution.map(item => ({
            method: item._id || 'unknown',
            count: item.count,
            totalAmount: item.totalAmount.toFixed(2),
          })),
        },
      });
    } catch (error) {
      console.error('Get performance metrics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve performance metrics',
      });
    }
  }
);

/**
 * @route   GET /api/admin/monitoring/failures
 * @desc    Get payment failure analysis
 * @access  Private (Admin only)
 * @rateLimit 20 requests per minute
 */
router.get(
  '/failures',
  protect,
  authorize('admin'),
  monitoringLimiter,
  async (req, res) => {
    try {
      const Transaction = require('../models/payment/Transaction');

      const timeRange = req.query.timeRange || '24h';
      let startDate;

      switch (timeRange) {
        case '24h':
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      // Get failure reasons distribution
      const failureReasons = await Transaction.aggregate([
        {
          $match: {
            status: 'failed',
            initiatedAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: '$errorCategory',
            count: { $sum: 1 },
            examples: { $push: '$errorMessage' },
          },
        },
      ]);

      // Get recent failed transactions
      const recentFailures = await Transaction.find({
        status: 'failed',
        initiatedAt: { $gte: startDate },
      })
        .populate('student', 'name email')
        .populate('course', 'title')
        .sort({ initiatedAt: -1 })
        .limit(10)
        .select('transactionId student course finalAmount errorCategory errorMessage initiatedAt')
        .lean();

      res.json({
        success: true,
        failures: {
          timeRange,
          reasonDistribution: failureReasons.map(item => ({
            category: item._id || 'unknown',
            count: item.count,
            exampleMessages: item.examples.slice(0, 3), // First 3 examples
          })),
          recentFailures: recentFailures.map(txn => ({
            transactionId: txn.transactionId,
            student: txn.student,
            course: txn.course,
            amount: parseFloat(txn.finalAmount.toString()).toFixed(2),
            errorCategory: txn.errorCategory,
            errorMessage: txn.errorMessage,
            initiatedAt: txn.initiatedAt,
          })),
        },
      });
    } catch (error) {
      console.error('Get failure analysis error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve failure analysis',
      });
    }
  }
);

module.exports = router;
