const crypto = require('crypto');
const { syncZoomRecordings } = require('../utils/zoomUtils');
const LiveSession = require('../models/liveSessionModel');

/**
 * Get webhook secret from environment
 * @returns {string|undefined} Webhook secret
 */
const getWebhookSecret = () => process.env.ZOOM_WEBHOOK_SECRET;

/**
 * Verify Zoom webhook signature
 * @param {string} signature - Signature from x-zm-signature header
 * @param {string} timestamp - Timestamp from x-zm-request-timestamp header
 * @param {Object} body - Request body
 * @returns {boolean} True if signature is valid
 */
const verifyWebhookSignature = (signature, timestamp, body) => {
  const ZOOM_WEBHOOK_SECRET = getWebhookSecret();
  
  if (!ZOOM_WEBHOOK_SECRET) {
    console.error('[Zoom Webhook] ZOOM_WEBHOOK_SECRET is not configured');
    return false;
  }

  if (!signature || !timestamp) {
    console.error('[Zoom Webhook] Missing signature or timestamp headers');
    return false;
  }

  try {
    // Construct the message string: v0:{timestamp}:{request_body}
    const message = `v0:${timestamp}:${JSON.stringify(body)}`;
    
    // Create HMAC SHA256 hash
    const hash = crypto
      .createHmac('sha256', ZOOM_WEBHOOK_SECRET)
      .update(message)
      .digest('hex');
    
    // Construct the expected signature
    const expectedSignature = `v0=${hash}`;
    
    // Compare signatures using timing-safe comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
    
    if (!isValid) {
      console.error('[Zoom Webhook] Signature verification failed');
      return false;
    }
    
    // Check timestamp to prevent replay attacks (reject if older than 5 minutes)
    const currentTime = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp, 10);
    const timeDiff = Math.abs(currentTime - requestTime);
    
    if (timeDiff > 300) { // 5 minutes
      console.error(`[Zoom Webhook] Timestamp too old: ${timeDiff}s difference`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[Zoom Webhook] Error verifying signature:', error.message);
    return false;
  }
};

/**
 * Handle Zoom webhook events
 * POST /api/webhooks/zoom
 */
const handleZoomWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-zm-signature'];
    const timestamp = req.headers['x-zm-request-timestamp'];
    const body = req.body;

    console.log('[Zoom Webhook] Received webhook event:', {
      event: body.event,
      timestamp: timestamp,
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      headers: req.headers
    });

    // Handle endpoint URL validation FIRST (before signature verification)
    // This allows initial setup when ZOOM_WEBHOOK_SECRET is not yet configured
    if (body.event === 'endpoint.url_validation') {
      console.log('[Zoom Webhook] URL validation request received');
      console.log('[Zoom Webhook] Request body:', JSON.stringify(body, null, 2));
      
      // Respond with the plainToken in an encrypted_token field
      const plainToken = body.payload?.plainToken;
      if (!plainToken) {
        console.error('[Zoom Webhook] Missing plainToken in validation request');
        return res.status(400).json({
          success: false,
          message: 'Missing plainToken in validation request'
        });
      }

      const ZOOM_WEBHOOK_SECRET = getWebhookSecret();
      
      // If webhook secret is not configured, allow validation to proceed
      // This enables initial webhook setup
      if (!ZOOM_WEBHOOK_SECRET) {
        console.warn('[Zoom Webhook] ZOOM_WEBHOOK_SECRET not configured - allowing validation for initial setup');
        const response = {
          plainToken: plainToken,
          encryptedToken: plainToken // Return plainToken as encryptedToken for initial setup
        };
        console.log('[Zoom Webhook] Sending validation response:', response);
        return res.status(200).json(response);
      }

      // Create encrypted token using HMAC SHA256
      const encryptedToken = crypto
        .createHmac('sha256', ZOOM_WEBHOOK_SECRET)
        .update(plainToken)
        .digest('hex');

      const response = {
        plainToken: plainToken,
        encryptedToken: encryptedToken
      };
      console.log('[Zoom Webhook] Sending validation response with secret:', response);
      return res.status(200).json(response);
    }

    // Verify webhook signature for all other events
    if (!verifyWebhookSignature(signature, timestamp, body)) {
      console.error('[Zoom Webhook] SECURITY WARNING: Signature verification failed', {
        timestamp,
        event: body.event,
        ip: req.ip || req.connection.remoteAddress
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    // Handle recording.completed event
    if (body.event === 'recording.completed') {
      console.log('[Zoom Webhook] Recording completed event received');
      
      const meetingId = body.payload?.object?.id;
      if (!meetingId) {
        console.error('[Zoom Webhook] Missing meeting ID in recording.completed event');
        return res.status(400).json({
          success: false,
          message: 'Missing meeting ID'
        });
      }

      console.log(`[Zoom Webhook] Processing recording for meeting: ${meetingId}`);

      // Find session by meeting ID
      const session = await LiveSession.findOne({ 'zoom.meetingId': meetingId.toString() });
      
      if (!session) {
        console.warn(`[Zoom Webhook] No session found for meeting ID: ${meetingId}`);
        // Return 200 to acknowledge receipt even if session not found
        return res.status(200).json({
          success: true,
          message: 'Webhook received but no matching session found'
        });
      }

      console.log(`[Zoom Webhook] Found session: ${session._id}, syncing recordings...`);

      // Trigger recording sync in background (don't block webhook response)
      syncZoomRecordings(session._id.toString(), 0)
        .then(() => {
          console.log(`[Zoom Webhook] Successfully synced recordings for session: ${session._id}`);
        })
        .catch((error) => {
          console.error(`[Zoom Webhook] Error syncing recordings for session: ${session._id}, Error: ${error.message}`);
        });

      // Respond immediately to acknowledge webhook
      return res.status(200).json({
        success: true,
        message: 'Recording sync initiated'
      });
    }

    // Handle other events (log and acknowledge)
    console.log(`[Zoom Webhook] Unhandled event type: ${body.event}`);
    return res.status(200).json({
      success: true,
      message: 'Webhook received'
    });

  } catch (error) {
    console.error('[Zoom Webhook] Error handling webhook:', error.message);
    
    // Always return 200 to prevent Zoom from retrying
    // Log the error for debugging but don't expose details
    return res.status(200).json({
      success: false,
      message: 'Webhook processing error'
    });
  }
};

module.exports = {
  handleZoomWebhook,
  verifyWebhookSignature
};
