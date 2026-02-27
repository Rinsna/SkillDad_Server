# Zoom Webhook Setup Guide

This guide explains how to configure Zoom webhooks for instant recording notifications in the SkillDad platform.

## Overview

Zoom webhooks provide instant notifications when events occur, such as when a cloud recording is completed. Without webhooks, the system polls the Zoom API every 5 minutes to check for recordings. With webhooks, the system receives instant notifications, reducing latency and API usage.

## Prerequisites

- Zoom account with webhook support
- Server-to-Server OAuth app or Meeting SDK app configured
- Publicly accessible webhook endpoint URL
- ZOOM_WEBHOOK_SECRET configured in environment variables

## Step 1: Generate Webhook Secret Token

1. Generate a secure random string for your webhook secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Add this to your `.env` file:
   ```bash
   ZOOM_WEBHOOK_SECRET=your_generated_secret_here
   ```

3. Restart your server to load the new environment variable.

## Step 2: Configure Webhook in Zoom Dashboard

### Option A: Using Server-to-Server OAuth App

1. Go to [Zoom App Marketplace](https://marketplace.zoom.us/)
2. Click **Develop** → **Build App**
3. Select your existing **Server-to-Server OAuth** app
4. Navigate to the **Feature** tab
5. Click **Add New Event Subscription**

### Option B: Using Meeting SDK App

1. Go to [Zoom App Marketplace](https://marketplace.zoom.us/)
2. Click **Develop** → **Build App**
3. Select your existing **Meeting SDK** app
4. Navigate to the **Feature** tab
5. Click **Add New Event Subscription**

## Step 3: Configure Event Subscription

1. **Subscription Name**: Enter a descriptive name (e.g., "SkillDad Recording Notifications")

2. **Event notification endpoint URL**: Enter your webhook endpoint URL
   - Format: `https://your-domain.com/api/webhooks/zoom`
   - Example: `https://api.skilldad.com/api/webhooks/zoom`
   - **Important**: Must be HTTPS (not HTTP) and publicly accessible

3. **Verification**: Zoom will send a validation request to your endpoint
   - The endpoint will automatically respond with the encrypted token
   - If validation fails, check:
     - Endpoint is publicly accessible
     - ZOOM_WEBHOOK_SECRET is configured correctly
     - Server is running

4. **Add Event Types**: Select the events you want to receive
   - Click **Add Event Types**
   - Search for and select: **Recording Completed** (`recording.completed`)
   - This event is triggered when a cloud recording finishes processing

5. **Save**: Click **Save** to activate the webhook

## Step 4: Verify Webhook Configuration

### Test Webhook Delivery

1. Create a test session in your application
2. Start and end the session
3. Wait for the recording to complete (usually 5-10 minutes)
4. Check your server logs for webhook events:
   ```bash
   tail -f server/logs/app.log | grep "Zoom Webhook"
   ```

### Expected Log Output

When a webhook is received successfully:
```
[Zoom Webhook] Received webhook event: { event: 'recording.completed', timestamp: '1234567890' }
[Zoom Webhook] Recording completed event received
[Zoom Webhook] Processing recording for meeting: 123456789
[Zoom Webhook] Found session: 507f1f77bcf86cd799439011, syncing recordings...
[Zoom Webhook] Successfully synced recordings for session: 507f1f77bcf86cd799439011
```

### Troubleshooting

**Problem**: Webhook validation fails
- **Solution**: Ensure ZOOM_WEBHOOK_SECRET matches the secret in your Zoom app
- **Check**: Verify endpoint is publicly accessible (test with curl)

**Problem**: Webhook events not received
- **Solution**: Check Zoom app event subscription is active
- **Check**: Verify endpoint URL is correct and uses HTTPS

**Problem**: "Invalid webhook signature" error
- **Solution**: Verify ZOOM_WEBHOOK_SECRET is correct
- **Check**: Ensure no extra whitespace in environment variable

**Problem**: "No matching session found" warning
- **Solution**: This is normal if the meeting was not created through your app
- **Check**: Verify session was created with Zoom integration enabled

## Step 5: Monitor Webhook Activity

### View Webhook Logs in Zoom Dashboard

1. Go to your Zoom app in the marketplace
2. Navigate to **Feature** → **Event Subscriptions**
3. Click **View Logs** to see webhook delivery history
4. Check for:
   - Successful deliveries (200 status)
   - Failed deliveries (4xx/5xx status)
   - Retry attempts

### Server-Side Monitoring

Monitor webhook activity in your application logs:

```bash
# View all webhook events
grep "Zoom Webhook" server/logs/app.log

# View only recording.completed events
grep "recording.completed" server/logs/app.log

# View webhook errors
grep "Zoom Webhook.*Error" server/logs/app.log
```

## Webhook Event Details

### endpoint.url_validation

Sent by Zoom when you first configure the webhook URL.

**Request Body**:
```json
{
  "event": "endpoint.url_validation",
  "payload": {
    "plainToken": "random_string_from_zoom"
  }
}
```

**Expected Response**:
```json
{
  "plainToken": "random_string_from_zoom",
  "encryptedToken": "hmac_sha256_hash_of_plain_token"
}
```

### recording.completed

Sent when a cloud recording finishes processing.

**Request Body**:
```json
{
  "event": "recording.completed",
  "payload": {
    "account_id": "abc123",
    "object": {
      "id": "123456789",
      "uuid": "meeting_uuid",
      "host_id": "host_user_id",
      "topic": "Session Topic",
      "start_time": "2024-01-15T10:00:00Z",
      "duration": 60,
      "recording_files": [
        {
          "id": "recording_file_id",
          "recording_start": "2024-01-15T10:00:00Z",
          "recording_end": "2024-01-15T11:00:00Z",
          "file_type": "MP4",
          "file_size": 123456789,
          "play_url": "https://zoom.us/rec/play/...",
          "download_url": "https://zoom.us/rec/download/...",
          "status": "completed",
          "recording_type": "shared_screen_with_speaker_view"
        }
      ]
    }
  }
}
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Recording sync initiated"
}
```

## Security Considerations

### Signature Verification

The webhook endpoint verifies every request using HMAC SHA256:

1. Zoom sends signature in `x-zm-signature` header
2. Zoom sends timestamp in `x-zm-request-timestamp` header
3. Server constructs message: `v0:{timestamp}:{request_body}`
4. Server computes HMAC SHA256 hash using ZOOM_WEBHOOK_SECRET
5. Server compares computed signature with received signature
6. Request is rejected if signatures don't match

### Replay Attack Prevention

The webhook endpoint rejects requests with timestamps older than 5 minutes:

- Prevents attackers from replaying captured webhook requests
- Ensures webhook events are processed in near real-time
- Protects against timing-based attacks

### Best Practices

1. **Keep webhook secret secure**
   - Never commit to version control
   - Rotate periodically (every 90 days)
   - Use different secrets for dev/staging/production

2. **Use HTTPS only**
   - Zoom requires HTTPS for webhook endpoints
   - Ensures encrypted communication
   - Prevents man-in-the-middle attacks

3. **Monitor webhook failures**
   - Set up alerts for repeated webhook failures
   - Check Zoom dashboard logs regularly
   - Investigate 4xx/5xx errors promptly

4. **Handle webhook retries gracefully**
   - Zoom retries failed webhooks up to 3 times
   - Ensure endpoint is idempotent (safe to call multiple times)
   - Return 200 status even for duplicate events

## Disabling Webhooks

If you need to disable webhooks temporarily:

1. **Option 1**: Remove event subscription in Zoom dashboard
   - Go to your Zoom app → Feature → Event Subscriptions
   - Click **Delete** next to the subscription
   - System will fall back to polling every 5 minutes

2. **Option 2**: Comment out webhook route in server.js
   ```javascript
   // app.use('/api/webhooks', require('./routes/webhookRoutes'));
   ```
   - Restart server
   - Zoom will receive 404 errors and stop sending webhooks

3. **Option 3**: Return 410 Gone status
   - Zoom will permanently stop sending webhooks to this endpoint
   - Useful when migrating to a new webhook URL

## Migration from Polling to Webhooks

If you're currently using polling (default behavior):

1. **Before enabling webhooks**:
   - System polls Zoom API every 5 minutes for recordings
   - Recording availability delay: 5-10 minutes average
   - Higher API usage

2. **After enabling webhooks**:
   - System receives instant notifications
   - Recording availability delay: <1 minute
   - Lower API usage (no polling needed)
   - Polling still runs as fallback for missed webhooks

3. **Gradual rollout**:
   - Enable webhooks in production
   - Monitor for 1 week
   - Verify all recordings are synced correctly
   - Keep polling as fallback (don't disable)

## Additional Resources

- [Zoom Webhook Documentation](https://developers.zoom.us/docs/api/rest/webhook-reference/)
- [Zoom Event Subscriptions Guide](https://developers.zoom.us/docs/api/rest/webhook-only-app/)
- [Zoom Recording Completed Event](https://developers.zoom.us/docs/api/rest/webhook-reference/recording-events/#recording-completed)

---

**Last Updated**: 2024
**Version**: 1.0

