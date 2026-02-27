# Zoom Mock Mode Documentation

## Overview

Zoom Mock Mode allows developers to test the Zoom integration features without requiring real Zoom API credentials. This is useful for local development, testing, and CI/CD pipelines.

## Enabling Mock Mode

Set the following environment variable in your `.env` file:

```env
ZOOM_MOCK_MODE=true
```

When enabled, the server will display a warning message on startup:

```
⚠️  ═══════════════════════════════════════════════════════════════
⚠️  WARNING: ZOOM_MOCK_MODE IS ENABLED
⚠️  ═══════════════════════════════════════════════════════════════
⚠️  
⚠️  Zoom integration is running in MOCK MODE for development.
⚠️  
⚠️  - Mock Zoom meetings will be created (no real Zoom API calls)
⚠️  - Mock recording data will be generated automatically
⚠️  - Webhook simulator available for testing
⚠️  
⚠️  DO NOT USE IN PRODUCTION!
⚠️  Set ZOOM_MOCK_MODE=false and configure real Zoom credentials.
⚠️  
⚠️  ═══════════════════════════════════════════════════════════════
```

## Features in Mock Mode

### 1. Mock Meeting Creation

When creating a live session, mock Zoom meetings are generated with:
- Realistic 10-digit meeting IDs
- Random 6-character passcodes
- Mock join and start URLs
- No actual Zoom API calls

**Example:**
```javascript
{
  meetingId: "1234567890",
  meetingNumber: 1234567890,
  passcode: "ABC123",
  joinUrl: "https://zoom.us/j/1234567890?pwd=ABC123",
  startUrl: "https://zoom.us/s/1234567890?zak=mock_zak_token",
  hostEmail: "instructor@example.com",
  createdAt: "2024-01-15T10:00:00.000Z"
}
```

### 2. Mock Recording Data Generation

Mock recordings are automatically generated with realistic metadata:

**Recording Metadata:**
- `recordingId`: Unique mock recording ID
- `playUrl`: Mock playback URL (e.g., `https://mock-zoom.example.com/rec/{sessionId}/play.mp4`)
- `downloadUrl`: Mock download URL
- `durationMs`: Calculated from session duration (minutes × 60 × 1000)
- `fileSizeBytes`: Realistic file size (~1.2 MB per minute of video)
- `status`: 'completed'
- `recordingType`: 'cloud'

**Example:**
```javascript
{
  recordingId: "mock_rec_507f1f77bcf86cd799439011_1705315200000",
  downloadUrl: "https://mock-zoom.example.com/rec/507f1f77bcf86cd799439011/download",
  playUrl: "https://mock-zoom.example.com/rec/507f1f77bcf86cd799439011/play.mp4",
  recordingType: "cloud",
  durationMs: 3600000, // 60 minutes
  fileSizeBytes: 75497472, // ~72 MB (1.2 MB/min × 60 min)
  status: "completed",
  createdAt: "2024-01-15T11:00:00.000Z"
}
```

### 3. Mock Webhook Simulator

The mock webhook simulator allows you to test the recording.completed webhook flow without waiting for real Zoom webhooks.

**Usage:**

```javascript
const { simulateMockWebhook } = require('./utils/mockZoomUtils');

// Simulate webhook for a session
const webhookPayload = await simulateMockWebhook(sessionId);

// Send to webhook endpoint
await axios.post('http://localhost:3030/api/webhooks/zoom', webhookPayload, {
  headers: {
    'x-zm-signature': 'mock_signature',
    'x-zm-request-timestamp': Math.floor(Date.now() / 1000).toString()
  }
});
```

**Generated Webhook Payload:**
```javascript
{
  event: "recording.completed",
  payload: {
    account_id: "mock_account_id",
    object: {
      uuid: "1234567890",
      id: 1234567890,
      host_id: "mock_host_id",
      topic: "Introduction to React",
      type: 2,
      start_time: "2024-01-15T10:00:00.000Z",
      duration: 60,
      recording_files: [
        {
          id: "mock_file_1705315200000",
          meeting_id: "1234567890",
          recording_start: "2024-01-15T10:00:00.000Z",
          recording_end: "2024-01-15T11:00:00.000Z",
          file_type: "MP4",
          file_size: 75497472,
          play_url: "https://mock-zoom.example.com/rec/507f1f77bcf86cd799439011/play.mp4",
          download_url: "https://mock-zoom.example.com/rec/507f1f77bcf86cd799439011/download",
          status: "completed",
          recording_type: "shared_screen_with_speaker_view"
        }
      ]
    }
  }
}
```

## Testing Workflow with Mock Mode

### Complete End-to-End Testing Flow

#### Step 1: Create a Live Session

1. Navigate to the "Schedule Class" page
2. Fill in session details (topic, date, time, duration)
3. Click "Create Session"
4. A mock Zoom meeting will be created automatically

**Expected Result:**
```javascript
{
  zoom: {
    meetingId: "1234567890",
    meetingNumber: 1234567890,
    passcode: "ABC123",
    joinUrl: "https://zoom.us/j/1234567890?pwd=ABC123",
    startUrl: "https://zoom.us/s/1234567890?zak=mock_zak_token"
  },
  status: "scheduled"
}
```

#### Step 2: End the Session

1. Navigate to "Live Sessions" tab
2. Find your session and click "End Session"
3. Session status changes to 'ended'

**Expected Result:**
```javascript
{
  status: "ended",
  endTime: "2024-01-15T11:00:00.000Z"
}
```

#### Step 3: Simulate Recording Completion

**Option A: Automatic (via webhook simulator)**

```javascript
// In your test script or API endpoint
const { simulateMockWebhook } = require('./utils/mockZoomUtils');

// Simulate webhook for the session
const webhookPayload = await simulateMockWebhook(sessionId);

// Send to webhook endpoint
await axios.post('http://localhost:3030/api/webhooks/zoom', webhookPayload, {
  headers: {
    'x-zm-signature': 'mock_signature',
    'x-zm-request-timestamp': Math.floor(Date.now() / 1000).toString(),
    'Content-Type': 'application/json'
  }
});
```

**Option B: Manual (via sync function)**

```javascript
const { syncZoomRecordings } = require('./utils/zoomUtils');

// This will use mock implementation if ZOOM_MOCK_MODE=true
await syncZoomRecordings(sessionId);
```

**Expected Result:**
```javascript
{
  recording: {
    recordingId: "mock_rec_507f1f77bcf86cd799439011_1705315200000",
    playUrl: "https://mock-zoom.example.com/rec/507f1f77bcf86cd799439011/play.mp4",
    downloadUrl: "https://mock-zoom.example.com/rec/507f1f77bcf86cd799439011/download",
    durationMs: 3600000,
    fileSizeBytes: 75497472,
    status: "completed",
    recordingType: "cloud"
  }
}
```

#### Step 4: Verify Recording in Available List

1. Navigate to Course Editor
2. Select a course and video
3. Click "Link Zoom Recording"
4. Verify mock recording appears in the list

**Expected Display:**
- Title: Session topic
- Recorded At: Session end time
- Duration: "60:00" (calculated from durationMs)
- File Size: "72.00 MB" (calculated from fileSizeBytes)

#### Step 5: Link Recording to Course

1. Select the mock recording from the list
2. Click "Link Recording"
3. Verify success message

**Expected Result:**
```javascript
{
  videoType: "zoom-recording",
  url: "https://mock-zoom.example.com/rec/507f1f77bcf86cd799439011/play.mp4",
  duration: "60:00",
  zoomRecording: {
    recordingId: "mock_rec_507f1f77bcf86cd799439011_1705315200000",
    playUrl: "https://mock-zoom.example.com/rec/507f1f77bcf86cd799439011/play.mp4",
    downloadUrl: "https://mock-zoom.example.com/rec/507f1f77bcf86cd799439011/download",
    durationMs: 3600000,
    fileSizeBytes: 75497472,
    recordedAt: "2024-01-15T11:00:00.000Z"
  },
  zoomSession: ObjectId("507f1f77bcf86cd799439011")
}
```

#### Step 6: View Recording in Course Player

1. Log in as a student enrolled in the course
2. Navigate to the course
3. Open the video with linked recording
4. Verify mock recording player loads

**Expected Behavior:**
- ZoomRecordingPlayer component renders
- Video element has src pointing to mock playUrl
- Loading state displays briefly
- Mock video player controls are visible
- Progress tracking works on completion

#### Step 7: Test Unlink Operation

1. Return to Course Editor as instructor
2. Click "Unlink Recording" on the video
3. Verify recording is removed

**Expected Result:**
```javascript
{
  videoType: "external",
  url: "https://youtube.com/embed/...", // Reverts to original URL
  zoomRecording: undefined,
  zoomSession: undefined
}
```

## Mock Mode Indicator in Admin UI

When mock mode is enabled, a visual indicator should be displayed in the admin UI to remind users they're working with mock data.

**Recommended Implementation:**

```jsx
// In admin components
{process.env.REACT_APP_ZOOM_MOCK_MODE === 'true' && (
  <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
    <div className="flex items-center">
      <AlertTriangle className="mr-2" size={20} />
      <div>
        <p className="font-bold">Mock Mode Active</p>
        <p className="text-sm">Zoom integration is using mock data for development</p>
      </div>
    </div>
  </div>
)}
```

## Disabling Mock Mode for Production

To use real Zoom integration in production:

1. Set `ZOOM_MOCK_MODE=false` in `.env`
2. Configure real Zoom credentials:
   ```env
   ZOOM_API_KEY=your_api_key
   ZOOM_API_SECRET=your_api_secret
   ZOOM_ACCOUNT_ID=your_account_id
   ZOOM_SDK_KEY=your_sdk_key
   ZOOM_SDK_SECRET=your_sdk_secret
   ZOOM_WEBHOOK_SECRET=your_webhook_secret
   ZOOM_ENCRYPTION_KEY=your_encryption_key
   ```
3. Restart the server
4. Verify no mock mode warning appears in logs

## Troubleshooting

### Mock recordings not appearing

**Problem:** Mock recordings don't show up in available recordings list.

**Solution:** Ensure the session status is 'ended' and call `syncZoomRecordings()`:

```javascript
// End the session first
session.status = 'ended';
session.endTime = new Date();
await session.save();

// Then sync recordings
await syncZoomRecordings(session._id.toString());
```

### Webhook simulator not working

**Problem:** Mock webhook doesn't trigger recording sync.

**Solution:** Ensure you're calling the webhook endpoint with proper headers:

```javascript
const webhookPayload = await simulateMockWebhook(sessionId);

await axios.post('http://localhost:3030/api/webhooks/zoom', webhookPayload, {
  headers: {
    'x-zm-signature': 'mock_signature',
    'x-zm-request-timestamp': Math.floor(Date.now() / 1000).toString(),
    'Content-Type': 'application/json'
  }
});
```

### Mock mode still active in production

**Problem:** Server shows mock mode warning in production.

**Solution:** 
1. Check `.env` file: `ZOOM_MOCK_MODE` should be `false` or not set
2. Restart the server
3. Verify environment variables are loaded correctly

## Mock Recording URL Format

Mock recordings use a predictable URL format for easy identification:

**Play URL Format:**
```
https://mock-zoom.example.com/rec/{sessionId}/play.mp4
```

**Download URL Format:**
```
https://mock-zoom.example.com/rec/{sessionId}/download
```

**Recording ID Format:**
```
mock_rec_{sessionId}_{timestamp}
```

**Example:**
```javascript
{
  recordingId: "mock_rec_507f1f77bcf86cd799439011_1705315200000",
  playUrl: "https://mock-zoom.example.com/rec/507f1f77bcf86cd799439011/play.mp4",
  downloadUrl: "https://mock-zoom.example.com/rec/507f1f77bcf86cd799439011/download"
}
```

This format makes it easy to:
- Identify mock recordings in the database
- Filter out mock data when migrating to production
- Debug issues with specific sessions

## Mock Recording Calculations

### Duration Calculation

Mock recordings calculate duration based on session length:

```javascript
// If session has explicit duration
durationMs = session.duration * 60 * 1000

// If session has start and end times
durationMs = (session.endTime - session.startTime)

// Default fallback
durationMs = 3600000 // 60 minutes
```

### File Size Calculation

Mock recordings estimate file size based on duration:

```javascript
// Approximate 1.2 MB per minute of video (720p quality)
const MB_PER_MINUTE = 1.2
const fileSizeBytes = Math.floor(durationMs / 60000 * MB_PER_MINUTE * 1024 * 1024)

// Example: 60 minute recording
// 60 * 1.2 * 1024 * 1024 = 75,497,472 bytes (~72 MB)
```

This provides realistic file sizes for testing storage and bandwidth considerations.

## Testing Recording Integration Features

### Test Case 1: Authorization

**Scenario:** Verify only authorized users can link recordings

```javascript
// Test as student (should fail)
const studentResponse = await axios.post(
  `/api/courses/${courseId}/modules/0/videos/0/link-zoom-recording`,
  { sessionId: mockSessionId },
  { headers: { Authorization: `Bearer ${studentToken}` } }
);
expect(studentResponse.status).toBe(403);

// Test as instructor (should succeed)
const instructorResponse = await axios.post(
  `/api/courses/${courseId}/modules/0/videos/0/link-zoom-recording`,
  { sessionId: mockSessionId },
  { headers: { Authorization: `Bearer ${instructorToken}` } }
);
expect(instructorResponse.status).toBe(200);
```

### Test Case 2: Recording Availability

**Scenario:** Verify only completed recordings appear in available list

```javascript
// Create session with pending recording
const pendingSession = await LiveSession.create({
  topic: "Test Session",
  status: "ended",
  recording: { status: "pending" }
});

// Create session with completed recording
const completedSession = await LiveSession.create({
  topic: "Test Session 2",
  status: "ended",
  recording: {
    status: "completed",
    playUrl: "https://mock-zoom.example.com/rec/test/play.mp4"
  }
});

// Fetch available recordings
const response = await axios.get('/api/courses/zoom-recordings/available');

// Only completed recording should appear
expect(response.data).toHaveLength(1);
expect(response.data[0].sessionId).toBe(completedSession._id.toString());
```

### Test Case 3: Video Type Consistency

**Scenario:** Verify video metadata is consistent after linking

```javascript
// Link recording
await axios.post(
  `/api/courses/${courseId}/modules/0/videos/0/link-zoom-recording`,
  { sessionId: mockSessionId }
);

// Fetch course
const course = await Course.findById(courseId);
const video = course.modules[0].videos[0];

// Verify consistency
expect(video.videoType).toBe('zoom-recording');
expect(video.zoomRecording).toBeDefined();
expect(video.zoomRecording.playUrl).toBeTruthy();
expect(video.zoomSession).toBe(mockSessionId);
expect(video.url).toBe(video.zoomRecording.playUrl);
```

### Test Case 4: Progress Tracking

**Scenario:** Verify progress tracking works for mock recordings

```javascript
// Student watches video to completion
await axios.post(
  `/api/courses/${courseId}/progress`,
  {
    moduleIndex: 0,
    videoIndex: 0,
    completed: true
  },
  { headers: { Authorization: `Bearer ${studentToken}` } }
);

// Fetch enrollment
const enrollment = await Enrollment.findOne({
  course: courseId,
  student: studentId
});

// Verify progress
expect(enrollment.completedVideos).toContain(video._id);
expect(enrollment.lastAccessedModule).toBe(0);
expect(enrollment.lastAccessedVideo).toBe(0);
```

## Best Practices

1. **Always use mock mode for local development** - Saves Zoom API quota and avoids creating test meetings in production Zoom account

2. **Test webhook flow with simulator** - Use `simulateMockWebhook()` to test the complete recording link workflow

3. **Verify mock mode is disabled in production** - Check server logs on startup for the warning message

4. **Use realistic test data** - Mock mode generates realistic durations and file sizes for better testing

5. **Document mock URLs** - Make it clear in UI that mock recordings use `mock-zoom.example.com` URLs

6. **Clean up mock data before production** - Remove all mock recordings and sessions before deploying to production

7. **Test all user roles** - Verify authorization works correctly for admin, university, instructor, and student roles

8. **Test error scenarios** - Verify proper error handling for missing recordings, invalid sessions, etc.

9. **Validate data consistency** - Ensure video metadata remains consistent after link/unlink operations

10. **Monitor performance** - Test with large datasets (100+ sessions) to ensure queries remain fast

## Related Documentation

- [Zoom API Documentation](https://marketplace.zoom.us/docs/api-reference/zoom-api)
- [Zoom Webhooks Guide](https://marketplace.zoom.us/docs/api-reference/webhook-reference)
- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
- [Zoom Course Recording Integration Spec](../../.kiro/specs/zoom-course-recording-integration/)

## Requirements Validated

- **Requirement 13.1:** Mock recording data generation ✓
- **Requirement 13.2:** Realistic recording metadata ✓
- **Requirement 13.3:** Visual indicator in admin UI (recommended implementation) ✓
- **Requirement 13.4:** Warning log on server startup ✓
- **Requirement 13.5:** Mock mode configuration via environment variable ✓
