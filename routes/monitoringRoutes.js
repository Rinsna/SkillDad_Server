const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');

// Import authentication middleware
const { protect, authorize } = require('../middleware/authMiddleware');

// Import validation rules
const { metricsValidation } = require('../middleware/paymentValidation');

// Import rate limiting middleware
const { monitoringLimiter } = require('../middleware/rateLimiting');

const monitoringService = require('../services/payment/MonitoringService');

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
      const limit = parseInt(req.query.limit) || 20;

      // Get realtime transaction data
      const summary = await monitoringService.getRealtimeSummary(limit);

      res.json({
        success: true,
        recentTransactions: summary.recentTransactions,
        statusCounts: summary.statusCounts
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
      const timeRange = req.query.timeRange || '24h';

      // Get performance metrics
      const performance = await monitoringService.getPerformanceMetrics(timeRange);

      res.json({
        success: true,
        performance
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
      const timeRange = req.query.timeRange || '24h';

      // Get failure analysis
      const failures = await monitoringService.getFailureAnalysis(timeRange);

      res.json({
        success: true,
        failures
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
