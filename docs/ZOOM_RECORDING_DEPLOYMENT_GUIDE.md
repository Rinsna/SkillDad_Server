# Zoom Course Recording Integration - Deployment Guide

## Overview

This guide walks you through deploying the Zoom Course Recording Integration feature to production. This feature enables automatic capture of Zoom cloud recordings and seamless integration with course videos.

## Prerequisites

Before starting deployment, ensure you have:

- [ ] Active Zoom account with recording capabilities
- [ ] Access to Zoom Marketplace (for creating apps)
- [ ] Production server with HTTPS enabled (required for webhooks)
- [ ] MongoDB database with appropriate indexes
- [ ] Node.js 16+ installed on server
- [ ] Admin access to SkillDad platform

## Part 1: Zoom Marketplace App Setup

### Step 1: Create Server-to-Server OAuth App

1. Navigate to [Zoom App Marketplace](https://marketplace.zoom.us/)
2. Click **Develop** → **Build App**
3. Select **Server-to-Server OAuth** app type
4. Fill in app information:
   - **App Name**: SkillDad Recording Integration
   - **Company Name**: Your organization name
   - **Developer Contact**: Your email
5. Click **Create**

### Step 2: Configure OAuth Credentials

1. On the **App Credentials** page, note down:
   - **Account ID** (save as `ZOOM_ACCOUNT_ID`)
   - **Client ID** (save as `ZOOM_API_KEY`)
   - **Client Secret** (save as `ZOOM_API_SECRET`)
2. Click **Continue**

### Step 3: Add Required Scopes

1. Navigate to **Scopes** section
2. Add the following scopes:
   - `meeting:read:admin` - Read meeting information
   - `meeting:write:admin` - Create and manage meetings
   - `recording:read:admin` - Read recording information
   - `user:read:admin` - Read user information
3. Click **Continue**

### Step 4: Activate the App

1. Review app information
2. Click **Activate your app**
3. App is now ready to use

## Part 2: Webhook Configuration

### Step 1: Create Webhook-Only App

1. Return to [Zoom App Marketplace](https://marketplace.zoom.us/)
2. Click **Develop** → **Build App**
3. Select **Webhook Only** app type
4. Fill in app information:
   - **App Name**: SkillDad Recording Webhooks
   - **Company Name**: Your organization name
   - **Developer Contact**: Your email
5. Click **Create**

### Step 2: Configure Webhook Endpoint

1. In **Feature** section, add event subscription:
   - **Event notification endpoint URL**: `https://your-domain.com/api/webhooks/zoom`
   - Replace `your-domain.com` with your actual production domain
2. Zoom will send a validation request to verify the endpoint
3. Ensure your server is running and can respond to the validation

### Step 3: Subscribe to Events

1. In **Event types** section, subscribe to:
   - `recording.completed` - Triggered when recording processing finishes
2. Click **Save**

### Step 4: Generate Webhook Secret

1. Navigate to **Feature** → **Event Subscriptions**
2. Copy the **Secret Token** (save as `ZOOM_WEBHOOK_SECRET`)
3. This token is used to verify webhook authenticity

### Step 5: Activate Webhook App

1. Review webhook configuration
2. Click **Activate your app**
3. Webhooks are now active

## Part 3: Environment Variable Configuration

### Step 1: Update Production .env File

Add the following variables to your production `.env` file:

```bash
# Zoom API Credentials (from Server-to-Server OAuth app)
ZOOM_API_KEY=your_client_id_here
ZOOM_API_SECRET=your_client_secret_here
ZOOM_ACCOUNT_ID=your_account_id_here

# Zoom SDK Credentials (if using Meeting SDK)
ZOOM_SDK_KEY=your_sdk_key_here
ZOOM_SDK_SECRET=your_sdk_secret_here

# Zoom Webhook Secret (from Webhook app)
ZOOM_WEBHOOK_SECRET=your_webhook_secret_token_here

# Zoom Encryption Key (for storing meeting passcodes)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ZOOM_ENCRYPTION_KEY=your_32_character_encryption_key_here

# Zoom Configuration
ZOOM_MOCK_MODE=false  # MUST be false in production
```

### Step 2: Verify Configuration

Run the environment variable check script:

```bash
cd server
node scripts/check_env.js
```

Expected output:
```
✓ ZOOM_API_KEY is set
✓ ZOOM_API_SECRET is set
✓ ZOOM_ACCOUNT_ID is set
✓ ZOOM_WEBHOOK_SECRET is set
✓ ZOOM_ENCRYPTION_KEY is set (32+ characters)
✓ ZOOM_MOCK_MODE is false
```

### Step 3: Secure Credentials

**CRITICAL SECURITY STEPS:**

1. Never commit `.env` file to version control
2. Ensure `.env` is in `.gitignore`
3. Use environment-specific credentials (dev/staging/prod)
4. Store production secrets in secure vault (AWS Secrets Manager, HashiCorp Vault)
5. Rotate credentials every 90 days
6. Limit access to production environment variables

## Part 4: Database Index Creation

### Step 1: Create Required Indexes

Run the migration script to create performance indexes:

```bash
cd server
node scripts/create_zoom_recording_indexes.js
```

This creates a compound index on the `LiveSession` collection:
```javascript
{ status: 1, 'recording.status': 1, endTime: -1 }
```

### Step 2: Verify Index Creation

Connect to MongoDB and verify indexes:

```bash
mongosh "mongodb://your-mongo-uri"
```

```javascript
use skilldad
db.livesessions.getIndexes()
```

Expected output should include:
```javascript
{
  "v": 2,
  "key": {
    "status": 1,
    "recording.status": 1,
    "endTime": -1
  },
  "name": "status_1_recording.status_1_endTime_-1"
}
```

### Step 3: Test Query Performance

Run performance test:

```bash
node scripts/test_recording_query_performance.js
```

Expected results:
- Query time: < 50ms for 1000+ sessions
- Memory usage: < 10MB

## Part 5: Server Deployment

### Step 1: Install Dependencies

```bash
cd server
npm install
```

### Step 2: Build Application (if using TypeScript)

```bash
npm run build
```

### Step 3: Start Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Or using PM2 (recommended):
```bash
pm2 start server/index.js --name skilldad-api
pm2 save
pm2 startup
```

### Step 4: Verify Server Startup

Check server logs for:
```
✓ Server running on port 3030
✓ MongoDB connected
✓ Zoom integration initialized
✓ Webhook endpoint ready at /api/webhooks/zoom
```

If `ZOOM_MOCK_MODE=true` in production, you'll see:
```
⚠ WARNING: Zoom mock mode is enabled in production!
```

**Action Required:** Set `ZOOM_MOCK_MODE=false` immediately.

## Part 6: Webhook Endpoint Verification

### Step 1: Test Webhook Endpoint

Use Zoom's webhook validator or curl:

```bash
curl -X POST https://your-domain.com/api/webhooks/zoom \
  -H "Content-Type: application/json" \
  -H "x-zm-signature: test" \
  -d '{"event":"endpoint.url_validation","payload":{"plainToken":"test"}}'
```

Expected response:
```json
{
  "plainToken": "test",
  "encryptedToken": "..."
}
```

### Step 2: Verify HTTPS

Webhooks MUST use HTTPS. Verify your SSL certificate:

```bash
curl -I https://your-domain.com/api/webhooks/zoom
```

Expected:
```
HTTP/2 200
```

If you see certificate errors, fix SSL configuration before proceeding.

### Step 3: Test Signature Verification

Send a test webhook with valid signature:

```bash
# This will be done automatically by Zoom
# Manual testing requires computing HMAC-SHA256 signature
```

Check server logs for:
```
✓ Webhook signature verified
✓ Webhook processed successfully
```

## Part 7: Testing the Integration

### Step 1: Conduct Test Live Session

1. Log in as university user or instructor
2. Navigate to **Schedule Class**
3. Create a new live session with recording enabled
4. Start the Zoom meeting
5. Record at least 2-3 minutes of content
6. End the meeting

### Step 2: Wait for Recording Processing

Zoom typically takes 5-15 minutes to process recordings. Monitor:

1. Check Zoom dashboard for recording status
2. Watch server logs for webhook delivery
3. Verify `LiveSession.recording.status` updates to `'completed'`

Expected webhook log:
```
✓ Received Zoom webhook: recording.completed
✓ Found LiveSession for meeting: abc123-uuid
✓ Updated recording metadata
✓ Recording status: completed
```

### Step 3: Verify Recording Availability

1. Navigate to **Course Editor**
2. Select a course and video
3. Click **Link Zoom Recording**
4. Verify test recording appears in the list

Expected data:
- Title: Session topic
- Recorded At: Session end time
- Duration: Actual recording length (MM:SS)
- File Size: Recording file size

### Step 4: Link Recording to Course Video

1. Select the test recording
2. Click **Link Recording**
3. Verify success message
4. Check video metadata is updated

Expected video object:
```javascript
{
  videoType: 'zoom-recording',
  url: 'https://zoom.us/rec/play/...',
  duration: '03:45',
  zoomRecording: {
    recordingId: 'abc123-uuid',
    playUrl: 'https://zoom.us/rec/play/...',
    downloadUrl: 'https://zoom.us/rec/download/...',
    durationMs: 225000,
    fileSizeBytes: 12345678,
    recordedAt: '2024-01-15T10:00:00Z'
  },
  zoomSession: ObjectId('...')
}
```

### Step 5: Test Student Playback

1. Log in as student enrolled in the course
2. Navigate to the course
3. Open the video with linked recording
4. Verify Zoom recording player loads
5. Play the video and verify smooth playback
6. Complete the video and verify progress tracking

Expected behavior:
- Video loads within 2 seconds
- Playback is smooth without buffering
- Progress is tracked on completion
- Video ID added to `completedVideos` array

## Part 8: Migration from Mock Mode

### Step 1: Identify Mock Data

Query database for mock recordings:

```javascript
db.livesessions.find({
  'recording.recordingId': /^mock-/
}).count()
```

### Step 2: Clean Up Mock Data

**Option A: Delete mock recordings**
```javascript
db.livesessions.updateMany(
  { 'recording.recordingId': /^mock-/ },
  { $unset: { recording: "" } }
)
```

**Option B: Archive mock sessions**
```javascript
db.livesessions.updateMany(
  { 'recording.recordingId': /^mock-/ },
  { $set: { archived: true, archivedAt: new Date() } }
)
```

### Step 3: Update Course Videos

Remove any videos linked to mock recordings:

```javascript
db.courses.updateMany(
  { 'modules.videos.zoomRecording.recordingId': /^mock-/ },
  { $unset: { 'modules.$[].videos.$[video].zoomRecording': "" } },
  { arrayFilters: [{ 'video.zoomRecording.recordingId': /^mock-/ }] }
)
```

### Step 4: Verify Clean State

```javascript
// Should return 0
db.livesessions.find({ 'recording.recordingId': /^mock-/ }).count()
db.courses.find({ 'modules.videos.zoomRecording.recordingId': /^mock-/ }).count()
```

## Part 9: Monitoring and Maintenance

### Key Metrics to Monitor

**System Health:**
- Webhook delivery success rate (target: >99%)
- Recording link operation latency (target: <500ms)
- Video player load time (target: <2s)
- API error rate (target: <1%)

**Business Metrics:**
- Number of recordings captured per day
- Number of recordings linked to courses
- Student video completion rate
- Recording storage usage

### Logging

Monitor these log patterns:

**Success:**
```
✓ Webhook received: recording.completed
✓ Recording linked successfully
✓ Video playback started
```

**Warnings:**
```
⚠ Webhook signature verification took >100ms
⚠ Recording query took >200ms
⚠ Video player load took >3s
```

**Errors:**
```
✗ Webhook signature verification failed
✗ Recording not found for meeting
✗ Database connection failed
```

### Alerting

Set up alerts for:

1. **Webhook failures** (>5% failure rate)
2. **Database query performance** (>500ms average)
3. **API errors** (>10 errors/hour)
4. **Disk space** (>80% usage)
5. **Memory usage** (>90% usage)

### Backup Strategy

**Database Backups:**
- Daily full backup of MongoDB
- Hourly incremental backups
- Retain backups for 30 days
- Test restore procedure monthly

**Configuration Backups:**
- Version control for code and configs
- Secure backup of `.env` file (encrypted)
- Document all Zoom app configurations

## Troubleshooting

### Issue 1: Webhooks Not Received

**Symptoms:**
- Recordings complete in Zoom but don't appear in available list
- No webhook logs in server

**Diagnosis:**
```bash
# Check webhook endpoint is accessible
curl -I https://your-domain.com/api/webhooks/zoom

# Check Zoom webhook configuration
# Visit Zoom Marketplace → Your App → Feature → Event Subscriptions
```

**Solutions:**
1. Verify webhook URL is correct in Zoom app
2. Ensure server is running and accessible
3. Check firewall rules allow Zoom IPs
4. Verify HTTPS certificate is valid
5. Check webhook secret matches environment variable

### Issue 2: Signature Verification Fails

**Symptoms:**
- Webhooks received but rejected with 401 error
- Log shows "Invalid webhook signature"

**Diagnosis:**
```bash
# Check webhook secret is set
echo $ZOOM_WEBHOOK_SECRET

# Check server logs for signature comparison
tail -f logs/server.log | grep "webhook signature"
```

**Solutions:**
1. Verify `ZOOM_WEBHOOK_SECRET` matches Zoom app configuration
2. Ensure no extra whitespace in environment variable
3. Restart server after updating environment variables
4. Check webhook payload is not modified by proxy/load balancer

### Issue 3: Recordings Not Appearing in Available List

**Symptoms:**
- Webhook processed successfully
- Recording status is 'completed'
- Recording doesn't appear in admin UI

**Diagnosis:**
```javascript
// Check LiveSession in database
db.livesessions.findOne({
  'zoom.meetingId': 'your-meeting-uuid'
})

// Check query filters
db.livesessions.find({
  status: 'ended',
  'recording.status': 'completed',
  'recording.playUrl': { $exists: true, $ne: null }
}).count()
```

**Solutions:**
1. Verify `status` is 'ended' (not 'scheduled' or 'ongoing')
2. Verify `recording.status` is 'completed'
3. Verify `recording.playUrl` is not null
4. Check user role filters (university users see only their sessions)
5. Clear cache if caching is enabled

### Issue 4: Video Player Fails to Load

**Symptoms:**
- Recording linked successfully
- Video player shows "Recording Unavailable" error

**Diagnosis:**
```bash
# Check recording URL is accessible
curl -I "https://zoom.us/rec/play/..."

# Check browser console for errors
# Open DevTools → Console
```

**Solutions:**
1. Verify recording URL is valid and not expired
2. Check Zoom recording is still available (not deleted)
3. Verify student is enrolled in course
4. Check browser supports HTML5 video
5. Try refreshing recording URL from Zoom API

### Issue 5: Database Performance Issues

**Symptoms:**
- Available recordings query takes >1 second
- Server becomes slow when listing recordings

**Diagnosis:**
```javascript
// Check if index exists
db.livesessions.getIndexes()

// Explain query plan
db.livesessions.find({
  status: 'ended',
  'recording.status': 'completed'
}).sort({ endTime: -1 }).explain('executionStats')
```

**Solutions:**
1. Verify compound index exists (see Part 4)
2. Run index creation script if missing
3. Check index is being used (explain plan shows IXSCAN)
4. Increase MongoDB memory allocation
5. Consider adding caching layer

## Security Checklist

Before going live, verify:

- [ ] `ZOOM_MOCK_MODE=false` in production
- [ ] All Zoom credentials are stored in environment variables
- [ ] `.env` file is not committed to version control
- [ ] HTTPS is enabled for webhook endpoint
- [ ] Webhook signature verification is working
- [ ] Recording URLs are validated (zoom.us domain only)
- [ ] RBAC is enforced on all endpoints
- [ ] JWT tokens have short expiration (1 hour)
- [ ] Database backups are configured
- [ ] Monitoring and alerting are set up
- [ ] Error logs don't expose sensitive data
- [ ] Rate limiting is enabled on webhook endpoint

## Performance Checklist

Verify these performance targets:

- [ ] Available recordings query: < 200ms
- [ ] Link recording operation: < 500ms
- [ ] Webhook processing: < 150ms
- [ ] Video player first frame: < 2s
- [ ] Database index query time: < 50ms
- [ ] API error rate: < 1%
- [ ] Webhook success rate: > 99%

## Rollback Plan

If issues occur after deployment:

### Step 1: Immediate Rollback

```bash
# Stop current server
pm2 stop skilldad-api

# Revert to previous version
git checkout previous-stable-tag

# Reinstall dependencies
npm install

# Restart server
pm2 start skilldad-api
```

### Step 2: Disable Zoom Integration

Set `ZOOM_MOCK_MODE=true` temporarily:

```bash
# Edit .env
ZOOM_MOCK_MODE=true

# Restart server
pm2 restart skilldad-api
```

This allows the system to function with mock data while issues are resolved.

### Step 3: Notify Users

Send notification to instructors:
- Zoom recording integration is temporarily unavailable
- Manual video uploads still work
- Issue is being investigated
- ETA for resolution

### Step 4: Investigate and Fix

1. Review error logs
2. Identify root cause
3. Apply fix in development environment
4. Test thoroughly
5. Deploy fix to production
6. Re-enable Zoom integration

## Support and Resources

### Documentation

- [Zoom API Documentation](https://developers.zoom.us/docs/api/)
- [Zoom Webhook Reference](https://developers.zoom.us/docs/api-reference/webhook-reference/)
- [SkillDad Environment Variables](./ENVIRONMENT_VARIABLES.md)
- [Zoom Mock Mode Guide](./ZOOM_MOCK_MODE.md)

### Contact

For deployment support:
- Technical Lead: [email]
- DevOps Team: [email]
- Zoom Support: https://support.zoom.us/

### Change Log

- **v1.0** (2024-01-15): Initial deployment guide
- **v1.1** (2024-01-20): Added troubleshooting section
- **v1.2** (2024-01-25): Added rollback procedures

---

**Last Updated**: 2024-01-25
**Version**: 1.2
**Status**: Production Ready
