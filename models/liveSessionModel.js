const mongoose = require('mongoose');

/* ── Notification sub-schema ───────────────────────────────── */
const notificationSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sentAt: { type: Date, default: Date.now },
    channel: { type: String, enum: ['email', 'in-app', 'push'], default: 'in-app' },
    delivered: { type: Boolean, default: false },
}, { _id: false });

/* ── Recording sub-schema ──────────────────────────────────── */
const recordingSchema = new mongoose.Schema({
    // Bunny.net fields (deprecated, kept for backward compatibility)
    bunnyVideoId: String,          // Bunny.net video GUID
    bunnyLibraryId: String,          // Bunny.net library ID
    storagePath: String,          // CDN playback path
    durationSecs: Number,
    sizeBytes: Number,
    signedUrlExpiry: Number,         // TTL seconds for signed URLs

    // Zoom recording fields
    recordingId: String,           // Zoom recording ID
    downloadUrl: String,           // Zoom recording download URL
    playUrl: String,               // Zoom recording playback URL
    recordingType: {               // Type of recording
        type: String,
        enum: ['cloud', 'local'],
    },
    durationMs: Number,            // Duration in milliseconds
    fileSizeBytes: Number,         // File size in bytes

    status: {
        type: String,
        enum: ['pending', 'processing', 'ready', 'completed', 'failed'],
        default: 'pending',
    },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

// Removed problem validation hook causing 'next is not a function'
/* ── Main LiveSession schema ───────────────────────────────── */
const liveSessionSchema = new mongoose.Schema({
    /* Core identity */
    topic: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    category: { type: String, default: 'General', index: true },
    tags: [String],
    meetingLink: { type: String, trim: true },

    /* Ownership & RBAC */
    university: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    instructor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    /* Course association (optional - if null, session is university-wide) */
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        index: true,
    },

    /* Enrolled / allowed students (subset of university students) */
    enrolledStudents: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
    }],

    /* Scheduling */
    startTime: { type: Date, required: true, index: true },
    endTime: Date,
    duration: { type: Number, required: true }, // minutes
    timezone: { type: String, default: 'Asia/Kolkata' },

    /* State machine: scheduled → live → ended → archived */
    status: {
        type: String,
        enum: ['scheduled', 'live', 'ended', 'cancelled', 'archived'],
        default: 'scheduled',
        index: true,
    },

    /* Bunny.net Stream integration (DEPRECATED - kept for backward compatibility)
     * 
     * DEPRECATION NOTICE:
     * The Bunny.net streaming infrastructure is being phased out in favor of Zoom.
     * This field is maintained for backward compatibility with legacy sessions.
     * 
     * Timeline:
     * - Phase 1 (Jan-Mar 2025): Backward compatibility - legacy sessions remain accessible
     * - Phase 2 (Apr-Jun 2025): Notification period - users encouraged to migrate
     * - Phase 3 (Jul-Sep 2025): Read-only access - legacy recordings only
     * - Phase 4 (Oct 2025+): Complete removal of bunny field
     * 
     * See: server/docs/BUNNY_DEPRECATION_TIMELINE.md for full details
     * 
     * DO NOT use this field for new sessions. Use the 'zoom' field instead.
     */
    bunny: {
        libraryId: String,   // Bunny Stream Library ID
        videoId: String,   // Bunny Video GUID (set when stream starts)
        streamKey: String,   // RTMP stream key (write-only, never returned in GET)
        rtmpEndpoint: String,   // rtmp://video.bunnycdn.com/live/<key>
        hlsPlaybackUrl: String, // HLS pull URL (unsigned)
        iframeSrc: String,   // Bunny embed iframe src
        pullZone: String,   // CDN pull zone hostname
        tokenAuthEnabled: { type: Boolean, default: true },
    },

    /* Zoom meeting integration */
    zoom: {
        meetingId: String,       // Zoom meeting UUID
        meetingNumber: Number,   // Zoom meeting number (numeric ID)
        passcode: String,        // Meeting passcode (encrypted)
        joinUrl: String,         // Join URL for participants
        startUrl: String,        // Start URL for host
        hostEmail: String,       // Email of the meeting host
        createdAt: Date,         // When the Zoom meeting was created
    },

    /* Auto-recording */
    recording: recordingSchema,

    /* Metrics */
    metrics: {
        peakViewers: { type: Number, default: 0 },
        totalJoins: { type: Number, default: 0 },
        avgWatchSecs: { type: Number, default: 0 },
        chatMessages: { type: Number, default: 0 },
    },

    /* Notifications sent to students */
    notifications: [notificationSchema],
    notificationSentAt: Date,

    /* Soft-delete / archival */
    isDeleted: { type: Boolean, default: false, index: true },

}, { timestamps: true });

/* ── Compound indexes for horizontal-scale queries ─────────── */
liveSessionSchema.index({ university: 1, status: 1, startTime: -1 });
liveSessionSchema.index({ status: 1, startTime: 1 });
liveSessionSchema.index({ enrolledStudents: 1, status: 1 });
liveSessionSchema.index({ course: 1, status: 1, startTime: -1 });
liveSessionSchema.index({ 'zoom.meetingId': 1 }); // Fast lookups by Zoom meeting ID
liveSessionSchema.index({ status: 1, 'recording.status': 1, endTime: -1 }); // Optimize available recordings query

/* ── Virtual: is session currently live? ────────────────────── */
liveSessionSchema.virtual('isCurrentlyLive').get(function () {
    return this.status === 'live';
});

const LiveSession = mongoose.model('LiveSession', liveSessionSchema);
module.exports = LiveSession;
