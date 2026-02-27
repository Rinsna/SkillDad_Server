# Bunny.net to Zoom Migration Guide

## Overview

This guide explains how to migrate existing live sessions from Bunny.net streaming infrastructure to Zoom meetings using the provided migration script.

## Migration Script

**Location**: `server/scripts/migrate_bunny_to_zoom.js`

**Purpose**: Identifies and migrates sessions that have Bunny.net data but no Zoom data.

## What the Script Does

1. **Identifies Legacy Sessions**: Finds all sessions with `bunny.videoId` but no `zoom.meetingId`
2. **Marks as Legacy**: Adds a `legacy-bunny` tag to each session
3. **Optional Placeholders**: Can create placeholder Zoom meeting data for scheduled sessions
4. **Updates Database**: Saves changes to the database
5. **Logs Progress**: Provides detailed logging of the migration process

## Usage

### Basic Usage (Dry Run)

First, run in dry-run mode to see what would be migrated without making any changes:

```bash
cd server
node scripts/migrate_bunny_to_zoom.js --dry-run
```

### Live Migration (No Placeholders)

Migrate sessions and mark them as legacy without creating placeholder Zoom meetings:

```bash
node scripts/migrate_bunny_to_zoom.js
```

### Live Migration (With Placeholders)

Migrate sessions and create placeholder Zoom meeting data for scheduled sessions:

```bash
node scripts/migrate_bunny_to_zoom.js --create-placeholders
```

### Combined Options

You can combine options to test placeholder creation in dry-run mode:

```bash
node scripts/migrate_bunny_to_zoom.js --dry-run --create-placeholders
```

## Command Line Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be migrated without making changes |
| `--create-placeholders` | Create placeholder Zoom meetings for scheduled sessions |

## Migration Scenarios

### Scenario 1: Ended Sessions

**Status**: `ended`, `cancelled`, or `archived`

**Action**: 
- Marked with `legacy-bunny` tag
- No Zoom meeting created
- Bunny.net recording data remains intact

**Recommendation**: Keep these sessions as-is. Recordings remain accessible via Bunny.net.

### Scenario 2: Scheduled Sessions (No Placeholders)

**Status**: `scheduled`

**Action**:
- Marked with `legacy-bunny` tag
- No Zoom meeting created

**Recommendation**: 
- Cancel these sessions and ask instructors to recreate them
- Or manually create Zoom meetings via the API

### Scenario 3: Scheduled Sessions (With Placeholders)

**Status**: `scheduled`

**Action**:
- Marked with `legacy-bunny` and `placeholder-zoom` tags
- Placeholder Zoom data created with:
  - `meetingId`: `legacy-{sessionId}`
  - `meetingNumber`: 0
  - `passcode`: 'legacy'
  - `joinUrl`: Original Bunny HLS URL (if available)

**Recommendation**: 
- These sessions need manual intervention
- Create actual Zoom meetings via the API
- Update the session with real Zoom meeting data

### Scenario 4: Live Sessions

**Status**: `live`

**Action**:
- Marked with `legacy-bunny` tag
- No Zoom meeting created

**Recommendation**: 
- Let the session complete
- After it ends, it will be handled as an ended session

## Post-Migration Steps

### 1. Review Migrated Sessions

Query the database to see migrated sessions:

```javascript
db.livesessions.find({ tags: 'legacy-bunny' })
```

### 2. Handle Scheduled Sessions

For scheduled sessions with placeholders:

```javascript
db.livesessions.find({ 
  tags: { $all: ['legacy-bunny', 'placeholder-zoom'] },
  status: 'scheduled'
})
```

Options:
- **Option A**: Cancel and ask instructors to recreate
- **Option B**: Create real Zoom meetings programmatically
- **Option C**: Manually create Zoom meetings and update records

### 3. Update Frontend

Ensure the frontend handles legacy sessions appropriately:

- Display a notice for sessions with `legacy-bunny` tag
- For ended sessions, continue using Bunny.net player for recordings
- For scheduled sessions with placeholders, show a migration notice

### 4. Monitor Errors

If the script reports errors, investigate and resolve:

```bash
# Check the script output for error details
# Common issues:
# - Database connection problems
# - Missing instructor/university references
# - Invalid session data
```

## Idempotency

The script is **idempotent** and safe to run multiple times:

- Sessions already marked with `legacy-bunny` tag won't be processed again
- Sessions with existing Zoom data are skipped
- No duplicate tags are created

## Rollback

If you need to rollback the migration:

```javascript
// Remove legacy tags
db.livesessions.updateMany(
  { tags: 'legacy-bunny' },
  { $pull: { tags: { $in: ['legacy-bunny', 'placeholder-zoom'] } } }
)

// Remove placeholder Zoom data (optional)
db.livesessions.updateMany(
  { 'zoom.meetingId': /^legacy-/ },
  { $unset: { zoom: '' } }
)
```

## Example Output

```
============================================================
Bunny.net to Zoom Migration Script
============================================================
Mode: LIVE
Create Placeholders: YES
============================================================

Connecting to database...
✓ Connected to database

Step 1: Identifying sessions to migrate...
Found 15 sessions with Bunny data but no Zoom data

Session breakdown by status:
  - Scheduled: 3
  - Live: 0
  - Ended: 10
  - Cancelled: 2
  - Archived: 0

Step 2: Processing sessions...

Processing session: 507f1f77bcf86cd799439011
  Topic: Introduction to React
  Status: scheduled
  Instructor: John Doe
  Start Time: 2024-02-15T10:00:00.000Z
  → Creating placeholder Zoom meeting...
  ✓ Placeholder Zoom meeting created
  ✓ Session updated successfully

...

============================================================
Migration Summary
============================================================
Total sessions found: 15
Successfully processed: 15
Errors: 0

✓ Migration completed successfully

Next steps:
1. Review migrated sessions in the database
2. For scheduled sessions with placeholders, consider:
   - Creating actual Zoom meetings via the API
   - Or cancelling/rescheduling them as new Zoom sessions
3. For ended sessions, recordings remain in Bunny.net
4. Update frontend to handle legacy sessions appropriately

✓ Database connection closed
```

## Troubleshooting

### Issue: "Cannot connect to database"

**Solution**: Check your `.env` file and ensure `MONGO_URI` is set correctly.

### Issue: "No sessions to migrate"

**Solution**: This is normal if all sessions already have Zoom data or no sessions have Bunny data.

### Issue: "Error processing session"

**Solution**: Check the error message for details. Common causes:
- Missing instructor or university references
- Invalid session data
- Database permission issues

### Issue: "Placeholder meetings not working"

**Solution**: Placeholder meetings are not real Zoom meetings. They need to be replaced with actual Zoom meetings created via the Zoom API.

## Support

For issues or questions:
1. Check the script output for detailed error messages
2. Review the session data in the database
3. Consult the Zoom Live Sessions Replacement specification
4. Contact the development team

## Related Files

- Migration Script: `server/scripts/migrate_bunny_to_zoom.js`
- LiveSession Model: `server/models/liveSessionModel.js`
- Zoom Utils: `server/utils/zoomUtils.js`
- Specification: `.kiro/specs/zoom-live-sessions-replacement/`
