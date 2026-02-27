const asyncHandler = require('express-async-handler');
const Course = require('../models/courseModel');
const LiveSession = require('../models/liveSessionModel');
const redisCache = require('../utils/redisCache');

/**
 * Link a Zoom recording from a live session to a course video
 * POST /api/courses/:courseId/modules/:moduleIndex/videos/:videoIndex/link-zoom-recording
 * 
 * Error Handling:
 * - 400: Session does not have a recording available
 * - 403: Not authorized to modify this course
 * - 404: Course, module, video, or session not found
 * - 500: Database errors (logged and returned)
 */
const linkZoomRecordingToVideo = asyncHandler(async (req, res) => {
    const { courseId, moduleIndex, videoIndex } = req.params;
    const { sessionId } = req.body;

    // Verify user is instructor, admin, or university owner
    const course = await Course.findById(courseId);
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Authorization check: admin can modify any course, others must be the course instructor
    // For university users, they must be the instructor (course creator)
    const isInstructor = course.instructor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isInstructor && !isAdmin) {
        res.status(403);
        throw new Error('Not authorized to modify this course');
    }

    // Fetch the live session and its recording
    const session = await LiveSession.findById(sessionId);
    if (!session) {
        res.status(404);
        throw new Error('Live session not found');
    }

    // Validate session has completed recording
    if (!session.recording || session.recording.status !== 'completed' || !session.recording.playUrl) {
        res.status(400);
        throw new Error('Session does not have a recording available');
    }

    // Update the video in the course
    const module = course.modules[parseInt(moduleIndex)];
    if (!module) {
        res.status(404);
        throw new Error('Module not found');
    }

    const video = module.videos[parseInt(videoIndex)];
    if (!video) {
        res.status(404);
        throw new Error('Video not found');
    }

    // Link the Zoom recording
    video.videoType = 'zoom-recording';
    video.url = session.recording.playUrl; // Fallback URL
    video.zoomRecording = {
        recordingId: session.recording.recordingId,
        playUrl: session.recording.playUrl,
        downloadUrl: session.recording.downloadUrl,
        durationMs: session.recording.durationMs,
        fileSizeBytes: session.recording.fileSizeBytes,
        recordedAt: session.endTime || session.startTime,
    };
    video.zoomSession = sessionId;

    // Update duration if available
    if (session.recording.durationMs) {
        const minutes = Math.floor(session.recording.durationMs / 60000);
        const seconds = Math.floor((session.recording.durationMs % 60000) / 1000);
        video.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Save course with error handling for database failures
    try {
        await course.save();
    } catch (error) {
        console.error('[Zoom Recording Link] Database error saving course:', {
            courseId,
            error: error.message,
            stack: error.stack
        });
        res.status(500);
        throw new Error('Failed to save course changes. Please try again.');
    }

    res.json({
        message: 'Zoom recording linked successfully',
        video: video,
    });
});

/**
 * Get all available Zoom recordings for linking to courses
 * GET /api/courses/zoom-recordings/available
 * 
 * Optimizations:
 * - Uses .lean() for read-only queries (faster, less memory)
 * - Projects only necessary fields
 * - Implements 5-minute caching
 * - Filters by user role
 * - Sorts by endTime descending, limits to 50 results
 * 
 * Error Handling:
 * - 500: Database query errors (logged and returned)
 */
const getAvailableZoomRecordings = asyncHandler(async (req, res) => {
    // Generate cache key based on user role and ID
    const cacheKey = `zoom:recordings:available:${req.user.role}:${req.user._id}`;
    const cacheTTL = 5 * 60; // 5 minutes in seconds
    
    // Try to get from cache first
    try {
        const r = redisCache.getRedis();
        if (r) {
            const cachedData = await r.get(cacheKey);
            if (cachedData) {
                console.log(`[Cache HIT] Available recordings for user ${req.user._id}`);
                return res.json(JSON.parse(cachedData));
            }
        }
    } catch (error) {
        console.warn('[Cache] Redis read error (non-fatal):', error.message);
    }
    
    // Cache miss - query database
    console.log(`[Cache MISS] Querying available recordings for user ${req.user._id}`);
    
    // Build filter for ended sessions with completed recordings
    const filter = {
        status: 'ended',
        'recording.status': 'completed',
        'recording.playUrl': { $exists: true, $ne: null },
    };

    // Filter by user role (Requirement 2.3, 2.4, 7.5)
    if (req.user.role === 'university') {
        // University users only see their own sessions
        filter.university = req.user._id;
    } else if (req.user.role === 'instructor') {
        // Instructors only see sessions they created
        filter.instructor = req.user._id;
    }
    // Admin users see all recordings (no filter applied)

    // Query with optimizations (Requirement 11.5)
    let sessions;
    try {
        sessions = await LiveSession.find(filter)
            .select('topic startTime endTime recording zoom') // Project only necessary fields
            .sort({ endTime: -1 }) // Sort by endTime descending (Requirement 2.5)
            .limit(50) // Limit to 50 results (Requirement 2.6)
            .lean(); // Use lean() for read-only queries (faster)
    } catch (error) {
        console.error('[Zoom Recordings] Database error querying sessions:', {
            userId: req.user._id,
            userRole: req.user.role,
            error: error.message,
            stack: error.stack
        });
        res.status(500);
        throw new Error('Failed to fetch available recordings. Please try again.');
    }

    // Transform to response format (Requirement 2.2)
    const recordings = sessions.map(session => ({
        sessionId: session._id,
        title: session.topic,
        recordedAt: session.endTime || session.startTime,
        duration: session.recording.durationMs 
            ? `${Math.floor(session.recording.durationMs / 60000)}:${Math.floor((session.recording.durationMs % 60000) / 1000).toString().padStart(2, '0')}`
            : 'Unknown',
        playUrl: session.recording.playUrl,
        downloadUrl: session.recording.downloadUrl,
        fileSize: session.recording.fileSizeBytes 
            ? `${(session.recording.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`
            : 'Unknown',
    }));

    // Cache the result for 5 minutes
    try {
        const r = redisCache.getRedis();
        if (r) {
            await r.setEx(cacheKey, cacheTTL, JSON.stringify(recordings));
            console.log(`[Cache SET] Cached available recordings for user ${req.user._id} (TTL: ${cacheTTL}s)`);
        }
    } catch (error) {
        console.warn('[Cache] Redis write error (non-fatal):', error.message);
    }

    res.json(recordings);
});

/**
 * Unlink a Zoom recording from a course video
 * DELETE /api/courses/:courseId/modules/:moduleIndex/videos/:videoIndex/unlink-zoom-recording
 * 
 * Error Handling:
 * - 403: Not authorized to modify this course
 * - 404: Course, module, or video not found
 * - 500: Database errors (logged and returned)
 */
const unlinkZoomRecordingFromVideo = asyncHandler(async (req, res) => {
    const { courseId, moduleIndex, videoIndex } = req.params;

    // Verify user is instructor, admin, or university owner
    const course = await Course.findById(courseId);
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Authorization check: admin can modify any course, university users must own the course, instructors must be the course instructor
    const isInstructor = course.instructor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    const isUniversityOwner = req.user.role === 'university' && course.instructor.toString() === req.user._id.toString();

    if (!isInstructor && !isAdmin && !isUniversityOwner) {
        res.status(403);
        throw new Error('Not authorized to modify this course');
    }

    // Update the video in the course
    const module = course.modules[parseInt(moduleIndex)];
    if (!module) {
        res.status(404);
        throw new Error('Module not found');
    }

    const video = module.videos[parseInt(videoIndex)];
    if (!video) {
        res.status(404);
        throw new Error('Video not found');
    }

    // Unlink the Zoom recording
    video.videoType = 'external';
    video.zoomRecording = undefined;
    video.zoomSession = undefined;

    // Save course with error handling for database failures
    try {
        await course.save();
    } catch (error) {
        console.error('[Zoom Recording Unlink] Database error saving course:', {
            courseId,
            error: error.message,
            stack: error.stack
        });
        res.status(500);
        throw new Error('Failed to save course changes. Please try again.');
    }

    res.json({
        message: 'Zoom recording unlinked successfully',
        video: video,
    });
});

module.exports = {
    linkZoomRecordingToVideo,
    getAvailableZoomRecordings,
    unlinkZoomRecordingFromVideo,
};
