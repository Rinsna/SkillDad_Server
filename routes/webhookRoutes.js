const express = require('express');
const router = express.Router();

const { handleZoomWebhook } = require('../controllers/webhookController');

/**
 * Zoom Webhook Routes
 * 
 * POST /api/webhooks/zoom - Handle Zoom webhook events
 * 
 * Events handled:
 * - endpoint.url_validation: Zoom sends this to validate the webhook URL
 * - recording.completed: Triggered when a cloud recording is ready
 * 
 * Security:
 * - Webhook signature verification using ZOOM_WEBHOOK_SECRET
 * - Timestamp validation to prevent replay attacks
 * - No authentication middleware (Zoom webhooks use signature verification)
 */

// Zoom webhook endpoint
// Note: No auth middleware - uses signature verification instead
router.post('/zoom', handleZoomWebhook);

// Health check endpoint for testing
router.get('/zoom', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Zoom webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
