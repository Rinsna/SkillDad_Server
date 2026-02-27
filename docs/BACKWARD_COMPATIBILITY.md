# Backward Compatibility Layer - Bunny.net to Zoom Migration

## Overview

This document describes the backward compatibility layer implemented to support legacy Bunny.net sessions during the migration to Zoom's embedded meeting SDK.

## Purpose

The backward compatibility layer ensures that:
1. Existing sessions with Bunny.net data remain accessible
2. Legacy recordings can still be viewed
3. The system gracefully handles both old and new session types
4. Users receive clear feedback about legacy sessions

## Implementation

### 1. Schema Compatibility

The `LiveSession` model maintains both `bunny` and `zoom` fields:

```javascript
{
  // New Zoom integration (for all new sessions)
  zoom: {
    meetingId: String,
    meetingNumber: Number,
    passcode: String,
    joinUrl: String,
    startUrl: String,
    hostEmail: String,
    createdAt: Date
  },
  
  // Legacy Bunny.net (deprecated, kept for backward compatibility)
  bunny: {
    libraryId: String,
    videoId: String,
    streamKey: String,
    rtmpEndpoint: String,
    hlsPlaybackUrl: String,
    iframeSrc: String,
    pullZone: String,
    tokenAuthEnabled: Boolean
  },
  
  // Tags for tracking migration status
  tags: ['legacy-bunny', 'placeholder-zoom']
}
```

**Important:** The `bunny` field is marked as deprecated and will be removed in Phase 4 (October 2025+).

### 2. Legacy Session Detection

Two helper functions identify legacy sessions:

```javascript
// Check if a session is a legacy Bunny session
const isLegacyBunnySession = (session) => {
    return session.tags?.includes('legacy-bunny') || 
           (session.bunny?.videoId && !session.zoom?.meetingId);
};

// Add legacy flag to session object for frontend
const addLegacyFlag = (session) => {
    if (isLegacyBunnySession(session)) {
        session.isLegacy = true;
        session.legacyType = 'bunny';
    }
    return session;
};
```

### 3. API Endpoint Behavior

#### GET /api/sessions/:id

Returns session data with `isLegacy` flag:

```json
{
  "_id": "...",
  "topic": "Legacy Session",
  "isLegacy": true,
  "legacyType": "bunny",
  "bunny": {
    "videoId": "...",
    "hlsPlaybackUrl": "..."
  }
}
```

#### GET /api/sessions/:id/zoom-config

For legacy sessions, returns 400 error:

```json
{
  "error": "This is a legacy session using Bunny.net streaming. Zoom SDK is not available for this session. Please use the legacy player."
}
```

#### GET /api/sessions/:id/recording

For legacy sessions, returns Bunny recording data:

```json
{
  "bunnyVideoId": "...",
  "storagePath": "...",
  "status": "ready",
  "isLegacy": true,
  "message": "This is a legacy Bunny.net recording"
}
```

#### GET /api/sessions/:id/recording/playback

For legacy sessions, returns Bunny playback URL:

```json
{
  "playUrl": "https://...",
  "downloadUrl": null,
  "recordingId": "...",
  "status": "ready",
  "isLegacy": true,
  "message": "This is a legacy Bunny.net recording"
}
```

### 4. Migration Script

The migration script (`server/scripts/migrate_bunny_to_zoom.js`) handles:

1. **Identifying legacy sessions:**
   - Finds sessions with `bunny.videoId` but no `zoom.meetingId`

2. **Tagging legacy sessions:**
   - Adds `legacy-bunny` tag to session tags array

3. **Creating placeholders (optional):**
   - For scheduled sessions, can create placeholder Zoom data
   - Adds `placeholder-zoom` tag

**Usage:**

```bash
# Dry run - see what would be migrated
node server/scripts/migrate_bunny_to_zoom.js --dry-run

# Tag legacy sessions
node server/scripts/migrate_bunny_to_zoom.js

# Tag and create placeholders for scheduled sessions
node server/scripts/migrate_bunny_to_zoom.js --create-placeholders
```

## Frontend Integration

### Detecting Legacy Sessions

Check the `isLegacy` flag in session data:

```javascript
// React component example
function SessionPlayer({ session }) {
  if (session.isLegacy) {
    return (
      <div>
        <DeprecationNotice />
        <LegacyBunnyPlayer 
          playbackUrl={session.bunny?.hlsPlaybackUrl} 
        />
      </div>
    );
  }
  
  return <ZoomMeeting sessionId={session._id} />;
}
```

### Handling Legacy Recordings

```javascript
// Recording playback example
function RecordingPlayer({ sessionId }) {
  const { data: recording } = useRecording(sessionId);
  
  if (recording.isLegacy) {
    return (
      <div>
        <LegacyNotice message={recording.message} />
        <HLSPlayer url={recording.playUrl} />
      </div>
    );
  }
  
  return <ZoomRecordingPlayer url={recording.playUrl} />;
}
```

### User Notifications

Display deprecation notices for legacy sessions:

```javascript
function DeprecationNotice() {
  return (
    <div className="alert alert-warning">
      <strong>⚠️ Legacy Session</strong>
      <p>
        This session uses the old streaming system. 
        Recordings will remain accessible, but we recommend 
        rescheduling important sessions using our new Zoom integration.
      </p>
      <a href="/help/migration">Learn more about the migration</a>
    </div>
  );
}
```

## Testing

### Test Cases

1. **Legacy session access:**
   - Verify legacy sessions return `isLegacy: true`
   - Verify Bunny data is accessible
   - Verify appropriate error messages for Zoom endpoints

2. **New session creation:**
   - Verify new sessions have Zoom data
   - Verify no Bunny data is created
   - Verify `isLegacy` is not set

3. **Recording playback:**
   - Verify legacy recordings return Bunny URLs
   - Verify new recordings return Zoom URLs
   - Verify appropriate flags are set

4. **Migration script:**
   - Test dry-run mode
   - Test tagging functionality
   - Test placeholder creation

### Manual Testing

```bash
# 1. Create a test legacy session (if needed)
# Use MongoDB shell or admin interface

# 2. Run migration script in dry-run mode
node server/scripts/migrate_bunny_to_zoom.js --dry-run

# 3. Test API endpoints
curl http://localhost:5000/api/sessions/{legacy-session-id}
curl http://localhost:5000/api/sessions/{legacy-session-id}/zoom-config
curl http://localhost:5000/api/sessions/{legacy-session-id}/recording

# 4. Verify frontend displays legacy notices
# Open session in browser and check UI
```

## Monitoring

### Metrics to Track

1. **Legacy session count:**
   ```javascript
   db.livesessions.countDocuments({ 
     tags: 'legacy-bunny' 
   })
   ```

2. **Legacy session access frequency:**
   - Track API calls to legacy sessions
   - Monitor recording playback requests

3. **Migration progress:**
   ```javascript
   // Total sessions
   db.livesessions.countDocuments({})
   
   // Legacy sessions
   db.livesessions.countDocuments({ tags: 'legacy-bunny' })
   
   // Zoom sessions
   db.livesessions.countDocuments({ 'zoom.meetingId': { $exists: true } })
   ```

### Logging

The system logs legacy session access:

```javascript
console.log('[Legacy Session] Accessed:', sessionId);
console.log('[Legacy Recording] Played:', sessionId);
```

## Troubleshooting

### Issue: Legacy session not detected

**Symptoms:** Session has Bunny data but `isLegacy` is false

**Solution:**
1. Check if session has `legacy-bunny` tag
2. Run migration script to tag session
3. Clear cache and retry

### Issue: Zoom config requested for legacy session

**Symptoms:** 400 error when requesting Zoom config

**Expected:** This is correct behavior for legacy sessions

**Solution:** Frontend should check `isLegacy` flag before requesting Zoom config

### Issue: Recording not found for legacy session

**Symptoms:** 404 error when accessing legacy recording

**Solution:**
1. Check if `bunny.hlsPlaybackUrl` exists
2. Verify Bunny.net CDN is still accessible
3. Check recording status in database

## Deprecation Timeline

See [BUNNY_DEPRECATION_TIMELINE.md](./BUNNY_DEPRECATION_TIMELINE.md) for the complete deprecation schedule.

**Current Phase:** Phase 1 - Backward Compatibility (Jan-Mar 2025)

**Next Steps:**
- Phase 2 (Apr-Jun 2025): Display deprecation notices
- Phase 3 (Jul-Sep 2025): Read-only legacy access
- Phase 4 (Oct 2025+): Complete removal

## Code Locations

### Backend
- **Schema:** `server/models/liveSessionModel.js`
- **Controller:** `server/controllers/liveSessionController.js`
- **Migration Script:** `server/scripts/migrate_bunny_to_zoom.js`
- **Helper Functions:** `isLegacyBunnySession()`, `addLegacyFlag()`

### Frontend
- **Zoom Meeting Component:** `client/src/components/ZoomMeeting.jsx`
- **Legacy Player:** (To be implemented based on existing HLS player)
- **Session Detail Page:** `client/src/pages/SessionDetail.jsx`

## Best Practices

1. **Always check `isLegacy` flag** before attempting Zoom operations
2. **Provide clear user feedback** for legacy sessions
3. **Log legacy session access** for monitoring
4. **Test both legacy and new sessions** in all features
5. **Document any new endpoints** that need backward compatibility

## Support

For questions or issues:
- Technical: Check this document and code comments
- Migration assistance: Contact dev team
- User support: Refer to deprecation timeline

---

**Last Updated:** January 2025  
**Document Owner:** Engineering Team  
**Related Documents:** 
- [BUNNY_DEPRECATION_TIMELINE.md](./BUNNY_DEPRECATION_TIMELINE.md)
- [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)
