# Zoom Recording API Documentation

## Overview

The Zoom Recording API enables seamless integration of Zoom cloud recordings into course videos. This API allows administrators and instructors to link recordings from live Zoom sessions to course content, providing students with on-demand access to recorded sessions.

## Table of Contents

- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [Webhook Endpoint](#webhook-endpoint)
  - [Get Available Recordings](#get-available-recordings)
  - [Link Recording to Video](#link-recording-to-video)
  - [Unlink Recording from Video](#unlink-recording-from-video)
- [Data Models](#data-models)
- [Error Codes](#error-codes)
- [Examples](#examples)

---

## Authentication

All API endpoints (except webhooks) require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

**Required Roles:**
- **Admin**: Full access to all recordings and courses
- **University**: Access to own recordings and courses
- **Instructor**: Access to own recordings and courses
- **Student**: No access to recording management endpoints

---

## Endpoints

### Webhook Endpoint

Receives webhook notifications from Zoom when recordings are completed.

#### `POST /api/webhooks/zoom`

**Authentication:** Webhook signature verification (no JWT required)

**Headers:**
```
x-zm-signature: v0=<hmac_sha256_signature>
x-zm-request-timestamp: <unix_timestamp>
Content-Type: application/json
```

**Request Body (endpoint.url_validation):**
```json
{
  "event": "endpoint.url_validation",
  "payload": {
    "plainToken": "random_string_from_zoom"
  }
}
```

**Response (endpoint.url_validation):**
```json
{
  "plainToken": "random_string_from_zoom",
  "encryptedToken": "hmac_sha256_hash_of_plain_token"
}
```

**Request Body (recording.completed):**
```json
{
  "event": "recording.completed",
  "payload": {
    "account_id": "abc123",
    "object": {
      "id": 123456789,
      "uuid": "meeting_uuid",
      "host_id": "host_user_id",
      "topic": "Introduction to React",
      "type": 2,
      "start_time": "2024-01-15T10:00:00Z",
      "duration": 60,
      "recording_files": [
        {
          "id": "recording_file_id",
          "meeting_id": "123456789",
          "recording_start": "2024-01-15T10:00:00Z",
          "recording_end": "2024-01-15T11:00:00Z",
          "file_type": "MP4",
          "file_size": 75497472,
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

**Response (recording.completed):**
```json
{
  "success": true,
  "message": "Recording sync initiated"
}
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 401 | Invalid webhook signature |
| 400 | Missing required fields (meeting ID, plainToken) |
| 200 | Webhook received (even if session not found) |

**Signature Verification Process:**

1. Extract `x-zm-signature` and `x-zm-request-timestamp` headers
2. Construct message: `v0:{timestamp}:{request_body_json}`
3. Compute HMAC-SHA256 hash using `ZOOM_WEBHOOK_SECRET`
4. Compare computed signature with received signature (timing-safe)
5. Reject if timestamp is older than 5 minutes (replay attack prevention)

**Example Signature Verification (Node.js):**
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(signature, timestamp, body) {
  const message = `v0:${timestamp}:${JSON.stringify(body)}`;
  const hash = crypto
    .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET)
    .update(message)
    .digest('hex');
  const expectedSignature = `v0=${hash}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

### Get Available Recordings

Retrieves a list of Zoom recordings available for linking to course videos.

#### `GET /api/courses/zoom-recordings/available`

**Authentication:** Required (JWT)

**Authorization:**
- **Admin**: Returns all recordings
- **University**: Returns only recordings from own sessions
- **Instructor**: Returns only recordings from own sessions

**Query Parameters:** None

**Response:**
```json
[
  {
    "sessionId": "507f191e810c19729de860ea",
    "title": "Introduction to React Hooks",
    "recordedAt": "2024-01-15T11:00:00.000Z",
    "duration": "45:30",
    "playUrl": "https://zoom.us/rec/play/abc123...",
    "downloadUrl": "https://zoom.us/rec/download/abc123...",
    "fileSize": "72.45 MB"
  },
  {
    "sessionId": "507f191e810c19729de860eb",
    "title": "Advanced State Management",
    "recordedAt": "2024-01-16T10:00:00.000Z",
    "duration": "60:15",
    "playUrl": "https://zoom.us/rec/play/def456...",
    "downloadUrl": "https://zoom.us/rec/download/def456...",
    "fileSize": "95.23 MB"
  }
]
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| sessionId | String | Live session ID (MongoDB ObjectId) |
| title | String | Session topic/title |
| recordedAt | Date | Recording completion timestamp |
| duration | String | Recording duration in MM:SS format |
| playUrl | String | Zoom cloud recording playback URL |
| downloadUrl | String | Zoom cloud recording download URL |
| fileSize | String | Recording file size (formatted) |

**Filtering:**
- Only sessions with `status='ended'`
- Only recordings with `recording.status='completed'`
- Only recordings with valid `playUrl`
- Sorted by `endTime` descending (most recent first)
- Limited to 50 results

**Caching:**
- Results are cached for 5 minutes per user
- Cache key: `zoom:recordings:available:{role}:{userId}`

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 500 | Database query error | Failed to fetch recordings |

**Example Request:**
```bash
curl -X GET https://api.skilldad.com/api/courses/zoom-recordings/available \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### Link Recording to Video

Links a Zoom recording from a live session to a specific course video.

#### `POST /api/courses/:courseId/modules/:moduleIndex/videos/:videoIndex/link-zoom-recording`

**Authentication:** Required (JWT)

**Authorization:**
- **Admin**: Can link recordings to any course
- **University**: Can link recordings to own courses only
- **Instructor**: Can link recordings to own courses only

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| courseId | String | Course ID (MongoDB ObjectId) |
| moduleIndex | Integer | Module index (0-based) |
| videoIndex | Integer | Video index within module (0-based) |

**Request Body:**
```json
{
  "sessionId": "507f191e810c19729de860ea"
}
```

**Response:**
```json
{
  "message": "Zoom recording linked successfully",
  "video": {
    "_id": "507f1f77bcf86cd799439013",
    "title": "React Hooks Deep Dive",
    "videoType": "zoom-recording",
    "url": "https://zoom.us/rec/play/abc123...",
    "duration": "45:30",
    "zoomRecording": {
      "recordingId": "abc123-meeting-uuid",
      "playUrl": "https://zoom.us/rec/play/abc123...",
      "downloadUrl": "https://zoom.us/rec/download/abc123...",
      "durationMs": 2730000,
      "fileSizeBytes": 75497472,
      "recordedAt": "2024-01-15T11:00:00.000Z"
    },
    "zoomSession": "507f191e810c19729de860ea",
    "exercises": []
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| message | String | Success message |
| video | Object | Updated video object with recording metadata |
| video.videoType | String | Set to 'zoom-recording' |
| video.zoomRecording | Object | Complete recording metadata |
| video.zoomSession | String | Reference to LiveSession ID |
| video.url | String | Fallback URL (set to playUrl) |
| video.duration | String | Calculated from durationMs (MM:SS) |

**Duration Calculation:**
```javascript
const minutes = Math.floor(durationMs / 60000);
const seconds = Math.floor((durationMs % 60000) / 1000);
const duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Session does not have a recording available | Recording not completed or missing playUrl |
| 403 | Not authorized to modify this course | User is not instructor/admin/owner |
| 404 | Course not found | Invalid courseId |
| 404 | Module not found | Invalid moduleIndex |
| 404 | Video not found | Invalid videoIndex |
| 404 | Live session not found | Invalid sessionId |
| 500 | Failed to save course changes | Database error |

**Example Request:**
```bash
curl -X POST https://api.skilldad.com/api/courses/507f1f77bcf86cd799439011/modules/0/videos/2/link-zoom-recording \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "507f191e810c19729de860ea"}'
```

---

### Unlink Recording from Video

Removes the Zoom recording link from a course video, reverting it to an external video.

#### `DELETE /api/courses/:courseId/modules/:moduleIndex/videos/:videoIndex/unlink-zoom-recording`

**Authentication:** Required (JWT)

**Authorization:**
- **Admin**: Can unlink recordings from any course
- **University**: Can unlink recordings from own courses only
- **Instructor**: Can unlink recordings from own courses only

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| courseId | String | Course ID (MongoDB ObjectId) |
| moduleIndex | Integer | Module index (0-based) |
| videoIndex | Integer | Video index within module (0-based) |

**Request Body:** None

**Response:**
```json
{
  "message": "Zoom recording unlinked successfully",
  "video": {
    "_id": "507f1f77bcf86cd799439013",
    "title": "React Hooks Deep Dive",
    "videoType": "external",
    "url": "https://youtube.com/embed/...",
    "duration": "45:30",
    "exercises": []
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| message | String | Success message |
| video | Object | Updated video object |
| video.videoType | String | Set to 'external' |
| video.zoomRecording | undefined | Removed |
| video.zoomSession | undefined | Removed |
| video.url | String | Preserved (original external URL) |

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 403 | Not authorized to modify this course | User is not instructor/admin/owner |
| 404 | Course not found | Invalid courseId |
| 404 | Module not found | Invalid moduleIndex |
| 404 | Video not found | Invalid videoIndex |
| 500 | Failed to save course changes | Database error |

**Example Request:**
```bash
curl -X DELETE https://api.skilldad.com/api/courses/507f1f77bcf86cd799439011/modules/0/videos/2/unlink-zoom-recording \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Data Models

### Video Object (Course.modules[].videos[])

```typescript
interface Video {
  _id: ObjectId;
  title: string;
  url: string;              // Fallback URL or Zoom playUrl
  duration: string;         // Format: "MM:SS"
  videoType: 'external' | 'zoom-recording' | 'zoom-live';
  
  // Zoom recording metadata (only when videoType='zoom-recording')
  zoomRecording?: {
    recordingId: string;      // Zoom recording UUID
    playUrl: string;          // Zoom cloud recording play URL
    downloadUrl: string;      // Zoom cloud recording download URL
    durationMs: number;       // Duration in milliseconds
    fileSizeBytes: number;    // File size in bytes
    recordedAt: Date;         // Recording completion timestamp
  };
  
  zoomSession?: ObjectId;     // Reference to LiveSession document
  exercises: Exercise[];
}
```

### LiveSession Recording Object

```typescript
interface Recording {
  recordingId: string;        // Zoom recording UUID
  downloadUrl: string;        // Zoom download URL
  playUrl: string;            // Zoom playback URL
  recordingType: 'cloud' | 'local';
  durationMs: number;         // Duration in milliseconds
  fileSizeBytes: number;      // File size in bytes
  status: 'pending' | 'processing' | 'ready' | 'completed' | 'failed';
  createdAt: Date;
}
```

---

## Error Codes

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful request |
| 400 | Bad Request | Invalid input, missing recording |
| 401 | Unauthorized | Invalid webhook signature |
| 403 | Forbidden | User not authorized for operation |
| 404 | Not Found | Resource not found (course, module, video, session) |
| 500 | Internal Server Error | Database error, unexpected failure |

### Error Response Format

```json
{
  "message": "Error description"
}
```

**Common Error Messages:**

| Message | Cause | Solution |
|---------|-------|----------|
| Session does not have a recording available | Recording not completed or missing playUrl | Wait for recording to complete, check Zoom |
| Not authorized to modify this course | User is not instructor/admin/owner | Verify user permissions |
| Course not found | Invalid courseId | Check course ID is correct |
| Module not found | Invalid moduleIndex | Check module index is within bounds |
| Video not found | Invalid videoIndex | Check video index is within bounds |
| Live session not found | Invalid sessionId | Check session ID is correct |
| Invalid webhook signature | Signature verification failed | Check ZOOM_WEBHOOK_SECRET configuration |
| Missing meeting ID | Webhook payload missing meeting ID | Check Zoom webhook configuration |
| Failed to save course changes | Database error | Check database connection, retry |

---

## Examples

### Example 1: Complete Recording Link Workflow

```javascript
// Step 1: Get available recordings
const response = await fetch('/api/courses/zoom-recordings/available', {
  headers: { Authorization: `Bearer ${token}` }
});
const recordings = await response.json();

console.log(recordings);
// [
//   {
//     sessionId: '507f191e810c19729de860ea',
//     title: 'Introduction to React Hooks',
//     recordedAt: '2024-01-15T11:00:00.000Z',
//     duration: '45:30',
//     playUrl: 'https://zoom.us/rec/play/abc123...',
//     downloadUrl: 'https://zoom.us/rec/download/abc123...',
//     fileSize: '72.45 MB'
//   }
// ]

// Step 2: Link recording to course video
const linkResponse = await fetch(
  '/api/courses/507f1f77bcf86cd799439011/modules/0/videos/2/link-zoom-recording',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ sessionId: recordings[0].sessionId })
  }
);

const result = await linkResponse.json();
console.log(result);
// {
//   message: 'Zoom recording linked successfully',
//   video: {
//     _id: '507f1f77bcf86cd799439013',
//     title: 'React Hooks Deep Dive',
//     videoType: 'zoom-recording',
//     url: 'https://zoom.us/rec/play/abc123...',
//     duration: '45:30',
//     zoomRecording: { ... },
//     zoomSession: '507f191e810c19729de860ea'
//   }
// }
```

### Example 2: Webhook Processing

```javascript
// Zoom sends webhook when recording is ready
// POST /api/webhooks/zoom
// Headers:
//   x-zm-signature: v0=abc123...
//   x-zm-request-timestamp: 1705315200

// Request body:
{
  "event": "recording.completed",
  "payload": {
    "object": {
      "id": 123456789,
      "uuid": "abc123-meeting-uuid",
      "recording_files": [
        {
          "file_type": "MP4",
          "file_size": 75497472,
          "play_url": "https://zoom.us/rec/play/abc123...",
          "download_url": "https://zoom.us/rec/download/abc123...",
          "recording_start": "2024-01-15T10:00:00Z",
          "recording_end": "2024-01-15T11:00:00Z"
        }
      ]
    }
  }
}

// Backend processes webhook:
// 1. Verifies signature
// 2. Finds LiveSession by meeting ID
// 3. Updates recording metadata
// 4. Responds with 200 OK

// Response:
{
  "success": true,
  "message": "Recording sync initiated"
}
```

### Example 3: Error Handling

```javascript
// Attempt to link recording that's not ready
const response = await fetch(
  '/api/courses/507f1f77bcf86cd799439011/modules/0/videos/2/link-zoom-recording',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ sessionId: 'session_without_recording' })
  }
);

if (!response.ok) {
  const error = await response.json();
  console.error(error);
  // {
  //   message: 'Session does not have a recording available'
  // }
  
  // Handle error: Show user message, wait for recording to complete
}
```

### Example 4: Unlink Recording

```javascript
// Unlink Zoom recording from video
const response = await fetch(
  '/api/courses/507f1f77bcf86cd799439011/modules/0/videos/2/unlink-zoom-recording',
  {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  }
);

const result = await response.json();
console.log(result);
// {
//   message: 'Zoom recording unlinked successfully',
//   video: {
//     _id: '507f1f77bcf86cd799439013',
//     title: 'React Hooks Deep Dive',
//     videoType: 'external',
//     url: 'https://youtube.com/embed/...',  // Reverted to original URL
//     duration: '45:30'
//   }
// }
```

---

## Performance Considerations

### Caching

Available recordings are cached for 5 minutes per user to reduce database load:

- Cache key: `zoom:recordings:available:{role}:{userId}`
- TTL: 300 seconds (5 minutes)
- Cache invalidation: Automatic expiration

### Query Optimization

- Uses `.lean()` for read-only queries (faster, less memory)
- Projects only necessary fields
- Compound index on LiveSession: `{ status: 1, 'recording.status': 1, endTime: -1 }`
- Limits results to 50 recordings

### Expected Performance

| Operation | Target | Typical |
|-----------|--------|---------|
| Get available recordings (cached) | < 50ms | 10-20ms |
| Get available recordings (uncached) | < 200ms | 100-150ms |
| Link recording | < 500ms | 200-300ms |
| Unlink recording | < 500ms | 200-300ms |
| Webhook processing | < 150ms | 50-100ms |

---

## Security

### Webhook Signature Verification

All webhook requests are verified using HMAC-SHA256:

1. Extract signature and timestamp from headers
2. Construct message: `v0:{timestamp}:{request_body}`
3. Compute HMAC-SHA256 hash using `ZOOM_WEBHOOK_SECRET`
4. Compare using timing-safe comparison
5. Reject if timestamp > 5 minutes old (replay attack prevention)

### Authorization

All management endpoints enforce role-based access control:

- **Admin**: Full access to all resources
- **University**: Access to own courses and sessions only
- **Instructor**: Access to own courses and sessions only
- **Student**: No access to management endpoints

### URL Validation

Recording URLs are validated to ensure they're from Zoom:

- Must use HTTPS protocol
- Must be from `zoom.us` domain
- Prevents injection of malicious URLs

---

## Related Documentation

- [Zoom Webhook Setup Guide](./ZOOM_WEBHOOK_SETUP.md)
- [Zoom Recording Deployment Guide](./ZOOM_RECORDING_DEPLOYMENT.md)
- [Zoom Mock Mode Documentation](./ZOOM_MOCK_MODE.md)
- [Environment Variables](./ENVIRONMENT_VARIABLES.md)

---

**Last Updated**: 2024  
**Version**: 1.0
