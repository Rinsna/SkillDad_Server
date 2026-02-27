/**
 * Migration Script: Bunny.net to Zoom Live Sessions
 * 
 * Purpose: Migrate existing sessions that have Bunny.net data but no Zoom data.
 * This script is idempotent and safe to run multiple times.
 * 
 * Actions:
 * 1. Identifies sessions with bunny data but no zoom data
 * 2. Marks them as legacy by adding a flag
 * 3. Optionally creates placeholder Zoom meetings for active/scheduled sessions
 * 4. Updates database records
 * 5. Logs migration progress
 * 
 * Usage:
 *   node server/scripts/migrate_bunny_to_zoom.js [--dry-run] [--create-placeholders]
 * 
 * Options:
 *   --dry-run              Show what would be migrated without making changes
 *   --create-placeholders  Create placeholder Zoom meetings for scheduled sessions
 * 
 * Requirements: 9.5
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const LiveSession = require('../models/liveSessionModel');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const createPlaceholders = args.includes('--create-placeholders');

/**
 * Main migration function
 */
async function migrateBunnyToZoom() {
    console.log('='.repeat(60));
    console.log('Bunny.net to Zoom Migration Script');
    console.log('='.repeat(60));
    console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
    console.log(`Create Placeholders: ${createPlaceholders ? 'YES' : 'NO'}`);
    console.log('='.repeat(60));
    console.log('');

    try {
        // Connect to database
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to database\n');

        // Step 1: Find sessions with bunny data but no zoom data
        console.log('Step 1: Identifying sessions to migrate...');
        const sessionsToMigrate = await LiveSession.find({
            'bunny.videoId': { $exists: true, $ne: null },
            'zoom.meetingId': { $exists: false }
        }).populate('instructor', 'name email')
          .populate('university', 'name');

        console.log(`Found ${sessionsToMigrate.length} sessions with Bunny data but no Zoom data\n`);

        if (sessionsToMigrate.length === 0) {
            console.log('✓ No sessions to migrate. All sessions are up to date.');
            await mongoose.connection.close();
            process.exit(0);
        }

        // Step 2: Categorize sessions
        const scheduled = sessionsToMigrate.filter(s => s.status === 'scheduled');
        const live = sessionsToMigrate.filter(s => s.status === 'live');
        const ended = sessionsToMigrate.filter(s => s.status === 'ended');
        const cancelled = sessionsToMigrate.filter(s => s.status === 'cancelled');
        const archived = sessionsToMigrate.filter(s => s.status === 'archived');

        console.log('Session breakdown by status:');
        console.log(`  - Scheduled: ${scheduled.length}`);
        console.log(`  - Live: ${live.length}`);
        console.log(`  - Ended: ${ended.length}`);
        console.log(`  - Cancelled: ${cancelled.length}`);
        console.log(`  - Archived: ${archived.length}`);
        console.log('');

        // Step 3: Process each session
        let migratedCount = 0;
        let errorCount = 0;
        const errors = [];

        console.log('Step 2: Processing sessions...\n');

        for (const session of sessionsToMigrate) {
            try {
                console.log(`Processing session: ${session._id}`);
                console.log(`  Topic: ${session.topic}`);
                console.log(`  Status: ${session.status}`);
                console.log(`  Instructor: ${session.instructor?.name || 'Unknown'}`);
                console.log(`  Start Time: ${session.startTime}`);

                if (!isDryRun) {
                    // Add legacy flag to the session
                    session.tags = session.tags || [];
                    if (!session.tags.includes('legacy-bunny')) {
                        session.tags.push('legacy-bunny');
                    }

                    // For scheduled sessions, optionally create placeholder Zoom meetings
                    if (session.status === 'scheduled' && createPlaceholders) {
                        console.log('  → Creating placeholder Zoom meeting...');
                        
                        // Create a placeholder zoom object
                        // Note: This doesn't actually create a Zoom meeting via API
                        // It just marks the session as migrated with placeholder data
                        session.zoom = {
                            meetingId: `legacy-${session._id}`,
                            meetingNumber: 0,
                            passcode: 'legacy',
                            joinUrl: session.bunny?.hlsPlaybackUrl || '',
                            startUrl: '',
                            hostEmail: session.instructor?.email || '',
                            createdAt: new Date()
                        };
                        
                        // Add a note in tags
                        if (!session.tags.includes('placeholder-zoom')) {
                            session.tags.push('placeholder-zoom');
                        }
                        
                        console.log('  ✓ Placeholder Zoom meeting created');
                    } else {
                        console.log('  → Marked as legacy (no Zoom meeting created)');
                    }

                    // Save the session
                    await session.save();
                    console.log('  ✓ Session updated successfully');
                } else {
                    console.log('  → Would mark as legacy');
                    if (session.status === 'scheduled' && createPlaceholders) {
                        console.log('  → Would create placeholder Zoom meeting');
                    }
                }

                migratedCount++;
                console.log('');
            } catch (error) {
                console.error(`  ✗ Error processing session ${session._id}:`, error.message);
                errorCount++;
                errors.push({
                    sessionId: session._id,
                    topic: session.topic,
                    error: error.message
                });
                console.log('');
            }
        }

        // Step 4: Summary
        console.log('='.repeat(60));
        console.log('Migration Summary');
        console.log('='.repeat(60));
        console.log(`Total sessions found: ${sessionsToMigrate.length}`);
        console.log(`Successfully processed: ${migratedCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log('');

        if (isDryRun) {
            console.log('⚠ DRY RUN MODE - No changes were made to the database');
            console.log('Run without --dry-run to apply changes');
        } else {
            console.log('✓ Migration completed successfully');
        }

        if (errors.length > 0) {
            console.log('\nErrors encountered:');
            errors.forEach(err => {
                console.log(`  - Session ${err.sessionId} (${err.topic}): ${err.error}`);
            });
        }

        console.log('');
        console.log('Next steps:');
        console.log('1. Review migrated sessions in the database');
        console.log('2. For scheduled sessions with placeholders, consider:');
        console.log('   - Creating actual Zoom meetings via the API');
        console.log('   - Or cancelling/rescheduling them as new Zoom sessions');
        console.log('3. For ended sessions, recordings remain in Bunny.net');
        console.log('4. Update frontend to handle legacy sessions appropriately');
        console.log('');

        // Close database connection
        await mongoose.connection.close();
        console.log('✓ Database connection closed');
        
        process.exit(errorCount > 0 ? 1 : 0);

    } catch (error) {
        console.error('\n✗ Fatal error during migration:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

// Run the migration
migrateBunnyToZoom();
