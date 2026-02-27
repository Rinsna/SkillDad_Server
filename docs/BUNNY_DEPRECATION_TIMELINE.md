# Bunny.net to Zoom Migration - Deprecation Timeline

## Overview

This document outlines the deprecation timeline for the Bunny.net live streaming infrastructure as we transition to Zoom's embedded meeting SDK.

## Migration Status

**Migration Date:** January 2025  
**Current Phase:** Backward Compatibility Period  
**Deprecation Status:** Bunny.net fields marked as deprecated

## Timeline

### Phase 1: Migration & Backward Compatibility (Current Phase)
**Duration:** January 2025 - March 2025 (3 months)

**Status:** ✅ Active

**Actions Completed:**
- ✅ Zoom integration infrastructure implemented
- ✅ Database schema updated with `zoom` field
- ✅ Migration script created (`server/scripts/migrate_bunny_to_zoom.js`)
- ✅ Backward compatibility layer added to API endpoints
- ✅ Legacy sessions tagged with `legacy-bunny` flag

**Current Behavior:**
- All new sessions are created with Zoom meetings
- Legacy sessions with Bunny data remain accessible
- API endpoints detect and handle legacy sessions appropriately
- Frontend receives `isLegacy` flag to render appropriate UI

**User Impact:**
- No disruption to existing sessions
- New sessions use Zoom SDK
- Legacy recordings remain accessible

### Phase 2: Legacy Session Notification Period
**Duration:** April 2025 - June 2025 (3 months)

**Status:** 🔜 Upcoming

**Planned Actions:**
- Display deprecation notices for legacy sessions in UI
- Email notifications to universities with legacy sessions
- Provide migration assistance for active legacy sessions
- Document legacy session access procedures

**User Impact:**
- Users will see notices about legacy sessions
- Encouraged to reschedule important legacy sessions as new Zoom sessions
- Legacy recordings remain accessible

### Phase 3: Read-Only Legacy Access
**Duration:** July 2025 - September 2025 (3 months)

**Status:** 📅 Planned

**Planned Actions:**
- Disable creation of new sessions with Bunny data
- Legacy sessions become read-only (view recordings only)
- Remove Bunny.net API integration code
- Archive legacy session data

**User Impact:**
- Cannot create new Bunny sessions (already the case)
- Can still view legacy recordings
- Legacy sessions marked as archived

### Phase 4: Complete Deprecation
**Duration:** October 2025 onwards

**Status:** 📅 Planned

**Planned Actions:**
- Remove `bunny` field from database schema
- Remove backward compatibility code from API
- Archive or migrate legacy recordings to Zoom or external storage
- Complete removal of Bunny.net dependencies

**User Impact:**
- Legacy sessions no longer accessible through main system
- Recordings archived or migrated to new storage
- Clean Zoom-only infrastructure

## Technical Details

### Database Schema Changes

#### Current State (Phase 1)
```javascript
{
  // New Zoom integration (active)
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
  
  // Tags for migration tracking
  tags: ['legacy-bunny', 'placeholder-zoom']
}
```

#### Future State (Phase 4)
```javascript
{
  // Only Zoom integration
  zoom: {
    meetingId: String,
    meetingNumber: Number,
    passcode: String,
    joinUrl: String,
    startUrl: String,
    hostEmail: String,
    createdAt: Date
  }
  // bunny field removed
}
```

### API Endpoint Behavior

#### Current Behavior (Phase 1)

**GET /api/sessions/:id**
- Returns session with `isLegacy: true` flag if Bunny session
- Includes both `zoom` and `bunny` data if available

**GET /api/sessions/:id/zoom-config**
- Returns 400 error for legacy Bunny sessions
- Error message: "This is a legacy session using Bunny.net streaming. Zoom SDK is not available for this session."

**GET /api/sessions/:id/recording**
- Returns Bunny recording data for legacy sessions
- Includes `isLegacy: true` flag
- Returns Zoom recording data for new sessions

**GET /api/sessions/:id/recording/playback**
- Returns Bunny HLS playback URL for legacy sessions
- Returns Zoom recording URLs for new sessions
- Includes `isLegacy: true` flag for legacy sessions

#### Future Behavior (Phase 4)
- All endpoints assume Zoom integration
- No legacy session handling
- Simplified codebase

### Migration Script Usage

The migration script (`server/scripts/migrate_bunny_to_zoom.js`) can be used to:

1. **Identify legacy sessions:**
   ```bash
   node server/scripts/migrate_bunny_to_zoom.js --dry-run
   ```

2. **Tag legacy sessions:**
   ```bash
   node server/scripts/migrate_bunny_to_zoom.js
   ```

3. **Create placeholder Zoom meetings for scheduled sessions:**
   ```bash
   node server/scripts/migrate_bunny_to_zoom.js --create-placeholders
   ```

## Frontend Integration

### Detecting Legacy Sessions

Frontend components should check the `isLegacy` flag:

```javascript
// Example: Session detail page
if (session.isLegacy) {
  // Show legacy player (HLS) or deprecation notice
  return <LegacyBunnyPlayer session={session} />;
} else {
  // Show Zoom SDK integration
  return <ZoomMeeting session={session} />;
}
```

### Deprecation Notices

During Phase 2, display notices like:

```
⚠️ This is a legacy session using the old streaming system.
Recordings will remain accessible, but we recommend rescheduling
important sessions using our new Zoom integration.
```

## Support & Migration Assistance

### For Universities
- Contact support for assistance migrating active legacy sessions
- Legacy recordings will be preserved and accessible
- Training available for new Zoom integration

### For Developers
- Review `server/controllers/liveSessionController.js` for backward compatibility logic
- Check `isLegacyBunnySession()` helper function
- Test with both legacy and new sessions

## Rollback Plan

If issues arise during migration:

1. **Phase 1-2:** Can extend backward compatibility period
2. **Phase 3:** Can restore Bunny.net API integration if needed
3. **Phase 4:** Point of no return - ensure all data is migrated

## Monitoring & Metrics

Track the following metrics during migration:

- Number of legacy sessions remaining
- Legacy session access frequency
- User feedback on new Zoom integration
- Recording migration progress

## Contact

For questions or concerns about the migration:
- Technical issues: dev-team@example.com
- Migration assistance: support@example.com
- Timeline questions: product@example.com

---

**Last Updated:** January 2025  
**Next Review:** March 2025  
**Document Owner:** Engineering Team
