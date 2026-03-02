const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const LiveSession = require('../models/liveSessionModel');
const User = require('../models/userModel');
const Enrollment = require('../models/enrollmentModel');
const notificationService = require('../services/NotificationService');
const socketService = require('../services/SocketService');
const { createZoomMeeting, generateZoomSignature, syncZoomRecordings, decryptPasscode } = require('../utils/zoomUtils');
const redisCache = require('../utils/redisCache');
const {
    cacheSessionStatus,
    getSessionStatus,
    cacheSession,
    getCachedSession,
    cacheUniSessions,
    getCachedUniSessions,
    markNotifSent,
    wasNotifSent,
    invalidateSession,
} = redisCache;

/* ── Env constants ──────────────────────────────────────────── */
const SIGNED_URL_TTL = parseInt(process.env.SIGNED_URL_TTL_SECS || '7200', 10);
const ZOOM_SDK_KEY = process.env.ZOOM_MOCK_MODE === 'true' ? 'MOCK_SDK_KEY' : (process.env.ZOOM_SDK_KEY || '');
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

/* ── RBAC helpers ───────────────────────────────────────────── */
const isUniversityOrAdmin = (user) =>
    user.role === 'university' || user.role === 'admin';

const canViewSession = (user, session) => {
    if (user.role === 'admin') return true;

    // Helper to extract ID from either ObjectId or populated object
    const extractId = (field) => {
        if (!field) return null;
        if (typeof field === 'string') return field;
        if (field._id) return field._id.toString();
        return field.toString();
    };

    // University can view their own sessions
    if (user.role === 'university') {
        const sessionUniversityId = extractId(session.university);
        const sessionInstructorId = extractId(session.instructor);
        const userId = user._id.toString();
        
        const universityMatch = sessionUniversityId === userId;
        const instructorMatch = sessionInstructorId === userId;
        
        return universityMatch || instructorMatch;
    }

    // Students can view if enrolled or if it's their university's session
    if (user.role === 'student') {
        const isEnrolled = session.enrolledStudents?.some(
            (sid) => extractId(sid) === user._id.toString()
        );
        if (isEnrolled) return true;

        // Also allow if it's their university's session
        const studentUniId = user.universityId || user.university;
        const sessionUniversityId = extractId(session.university);
        if (studentUniId && sessionUniversityId === extractId(studentUniId)) {
            return true;
        }
    }

    return false;
};

/* ── Backward compatibility helper ──────────────────────────── */
const isLegacyBunnySession = (session) => {
    // A session is considered legacy if:
    // 1. It has the 'legacy-bunny' tag, OR
    // 2. It has bunny data but no zoom data
    return session.tags?.includes('legacy-bunny') ||
        (session.bunny?.videoId && !session.zoom?.meetingId);
};

const addLegacyFlag = (session) => {
    // Add isLegacy flag to session object for frontend consumption
    if (isLegacyBunnySession(session)) {
        session.isLegacy = true;
        session.legacyType = 'bunny';
    }
    return session;
};

/* ── Authorization logging helper ───────────────────────────── */
const logAuthorizationFailure = (userId, operation, sessionId, reason) => {
    const timestamp = new Date().toISOString();
    console.error(`[AUTH FAILURE] ${timestamp} | User: ${userId} | Operation: ${operation} | Session: ${sessionId} | Reason: ${reason}`);
    // TODO: Consider storing in database for audit trail
};

/* ─────────────────────────────────────────────────────────────
   1. CREATE SESSION
   POST /api/sessions
──────────────────────────────────────────────────────────────*/
const createSession = asyncHandler(async (req, res) => {
    if (!isUniversityOrAdmin(req.user)) {
        logAuthorizationFailure(
            req.user._id.toString(),
            'create_session',
            'N/A',
            `User role '${req.user.role}' not authorized to create sessions`
        );
        res.status(403);
        throw new Error('Only universities or admins can create sessions');
    }

    const {
        topic, description, category, tags,
        startTime, duration, enrolledStudents,
        timezone, instructor, meetingLink,
    } = req.body;

    // Validate required fields
    if (!topic || !startTime || !duration) {
        res.status(400);
        throw new Error('topic, startTime and duration are required');
    }

    // Validate input: non-empty topic, future start time, positive duration
    if (!topic.trim()) {
        res.status(400);
        throw new Error('Topic must be non-empty');
    }

    const startDateTime = new Date(startTime);
    if (isNaN(startDateTime.getTime()) || startDateTime <= new Date()) {
        res.status(400);
        throw new Error('Start time must be a valid future date');
    }

    if (duration <= 0) {
        res.status(400);
        throw new Error('Duration must be a positive number');
    }

    /* Create Zoom Meeting */
    let zoomData = null;
    try {
        // Get instructor email for Zoom meeting creation
        const instructorId = instructor || req.user._id;
        const instructorUser = await User.findById(instructorId).select('email').lean();

        if (!instructorUser || !instructorUser.email) {
            res.status(400);
            throw new Error('Instructor email is required for Zoom meeting creation');
        }

        // Create Zoom meeting with retry logic (handled in createZoomMeeting)
        zoomData = await createZoomMeeting(
            topic,
            startDateTime,
            duration,
            instructorUser.email
        );

        console.log(`[Zoom] Meeting created successfully: ${zoomData.meetingId}`);
    } catch (err) {
        // Handle Zoom API errors: return 503 on failure, don't create database record
        console.error('[Zoom] Failed to create meeting:', err.message);
        res.status(503);
        throw new Error(`Failed to create Zoom meeting: ${err.message}`);
    }

    /* Auto-enroll all university students — done AFTER responding so we don't block */
    const targetUniId = req.user.role === 'university' ? req.user._id : req.body.universityId;
    let studentIds = enrolledStudents || [];

    const session = await LiveSession.create({
        topic,
        description,
        category: category || 'General',
        tags: tags || [],
        university: targetUniId,
        instructor: instructor || req.user._id,
        course: req.body.courseId || null,
        enrolledStudents: studentIds, // initially empty; filled in background
        startTime: startDateTime,
        duration,
        timezone: timezone || 'Asia/Kolkata',
        meetingLink,
        zoom: zoomData,
        status: 'scheduled',
        recording: { status: 'pending', signedUrlExpiry: SIGNED_URL_TTL },
    });

    // Respond immediately — don't wait for background jobs
    res.status(201).json(session);

    // Background: auto-enroll students based on course enrollment or university-wide
    setImmediate(async () => {
        try {
            let ids = [...studentIds];
            let allStudents = [];

            // 1. If courseId is provided, ONLY target students in that course
            if (req.body.courseId) {
                console.log(`[Auto-Enroll] Targeting course: ${req.body.courseId}`);
                const courseEnrollments = await Enrollment.find({
                    course: req.body.courseId,
                    status: 'active'
                }).select('student').lean();

                const enrolledStudentIds = courseEnrollments.map(e => e.student.toString());

                // Fetch student details for notifications
                allStudents = await User.find({
                    _id: { $in: enrolledStudentIds },
                    role: 'student'
                }).select('_id name email profile').lean();

                ids = Array.from(new Set([...ids.map(i => i.toString()), ...enrolledStudentIds]));
            }
            // 2. Otherwise, if targetUniId is valid, target ALL university students
            else if (targetUniId) {
                console.log(`[Auto-Enroll] Targeting university-wide: ${targetUniId}`);
                const uniStudents = await User.find({
                    $or: [{ universityId: targetUniId }, { university: targetUniId }],
                    role: 'student',
                }).select('_id name email profile').lean();

                allStudents = uniStudents;
                const uniIds = uniStudents.map((s) => s._id.toString());
                ids = Array.from(new Set([...ids.map(i => i.toString()), ...uniIds]));
            }

            // Sync the session's enrollment list
            if (ids.length > 0) {
                await LiveSession.findByIdAndUpdate(session._id, { enrolledStudents: ids });
                console.log(`[Auto-Enroll] Enrolled ${ids.length} students into session ${session._id}`);
            }

            // Send Notifications (Requirement: Email + WhatsApp + Real-time)
            console.log(`[Session Notif] Sending to ${allStudents.length} students`);
            for (const student of allStudents) {
                // Centralized Notification Service Call (Sync Email + WhatsApp)
                notificationService.send(
                    {
                        _id: student._id,
                        name: student.name,
                        email: student.email,
                        phone: student.profile?.phone || student.phone
                    },
                    'liveSession',
                    {
                        topic: session.topic,
                        startTime: session.startTime,
                        description: session.description
                    }
                ).catch(err => console.error(`[Session Notif] Delivery Error for ${student.email}:`, err.message));

                // 3. Real-time Notification via Socket
                socketService.sendToUser(
                    student._id,
                    'notification',
                    {
                        type: 'live_session_scheduled',
                        title: 'New Live Session',
                        message: `A new session "${session.topic}" has been scheduled.`,
                        sessionId: session._id,
                        startTime: session.startTime
                    }
                );
            }
            await invalidateSession(session._id.toString(), (targetUniId || '').toString());
        } catch (err) {
            console.error('[Session Background Job Error]:', err);
        }
    });

});

/* ─────────────────────────────────────────────────────────────
   2. GET ALL SESSIONS  GET /api/sessions
──────────────────────────────────────────────────────────────*/
const getSessions = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;

    if (req.user.role === 'student') {
        const studentUniId = req.user.universityId || req.user.university;

        // Get courses the student is enrolled in
        const enrollments = await Enrollment.find({
            student: req.user._id,
            status: 'active'
        }).select('course').lean();
        const enrolledCourseIds = enrollments.map(e => e.course.toString());

        const filter = {
            isDeleted: false,
            $or: [
                { enrolledStudents: req.user._id },
                { course: { $in: enrolledCourseIds } },
                { course: null, university: studentUniId } // University-wide sessions
            ]
        };
        if (status) filter.status = status;
        const sessions = await LiveSession.find(filter)
            .sort({ startTime: 1 })
            .populate('instructor', 'name email profileImage profile')
            .populate('course', 'title')
            .lean();

        // Students cannot view metrics (Requirement 12.5)
        sessions.forEach(session => {
            delete session.metrics;
            // Add legacy flag for backward compatibility
            addLegacyFlag(session);
        });

        return res.json(sessions);
    }

    if (req.user.role !== 'university' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied' });
    }

    const universityId = req.user.role === 'university'
        ? req.user._id.toString()
        : (req.query.universityId || null);

    const cacheKey = `${universityId}:${status || 'all'}:${page}:${limit}`;
    const cached = await getCachedUniSessions(cacheKey);
    if (cached) {
        // Metrics are included for university and admin users
        // Add legacy flags
        cached.forEach(session => addLegacyFlag(session));
        return res.json(cached);
    }

    const filter = { isDeleted: false };
    if (universityId) filter.university = universityId;
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sessions = await LiveSession.find(filter)
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('instructor', 'name email profileImage profile')
        .lean();

    // Metrics are included for university and admin users (Requirement 12.5)
    // Add legacy flags for backward compatibility
    sessions.forEach(session => addLegacyFlag(session));

    await cacheUniSessions(cacheKey, sessions);
    res.json(sessions);
});

/* ─────────────────────────────────────────────────────────────
   3. GET SINGLE SESSION  GET /api/sessions/:id
──────────────────────────────────────────────────────────────*/
const getSession = asyncHandler(async (req, res) => {
    const statusCache = await getSessionStatus(req.params.id);
    const fullCache = await getCachedSession(req.params.id);
    if (fullCache) {
        if (!canViewSession(req.user, fullCache))
            return res.status(403).json({ message: 'Access denied' });
        if (statusCache) fullCache.status = statusCache.status;

        // Authorization check for metrics access (Requirement 12.5)
        const canViewMetrics = req.user.role === 'admin' ||
            req.user.role === 'university' ||
            fullCache.instructor?.toString() === req.user._id.toString();
        if (!canViewMetrics) {
            delete fullCache.metrics;
        }

        // Add legacy flag for backward compatibility
        addLegacyFlag(fullCache);

        return res.json(fullCache);
    }

    const session = await LiveSession.findOne({ _id: req.params.id, isDeleted: false })
        .populate('instructor', 'name email profileImage')
        .populate('university', 'name profile.universityName')
        .lean();

    if (!session) { res.status(404); throw new Error('Session not found'); }
    if (!canViewSession(req.user, session))
        return res.status(403).json({ message: 'Access denied' });

    await cacheSession(session);
    await cacheSessionStatus(session._id.toString(), session.status);

    // Authorization check for metrics access (Requirement 12.5)
    const canViewMetrics = req.user.role === 'admin' ||
        req.user.role === 'university' ||
        session.instructor?.toString() === req.user._id.toString();
    if (!canViewMetrics) {
        delete session.metrics;
    }

    // Add legacy flag for backward compatibility
    addLegacyFlag(session);

    res.json(session);
});

/* ─────────────────────────────────────────────────────────────
   4. START SESSION  PUT /api/sessions/:id/start
──────────────────────────────────────────────────────────────*/
const startSession = asyncHandler(async (req, res) => {
    const session = await LiveSession.findById(req.params.id);
    if (!session || session.isDeleted) { res.status(404); throw new Error('Not found'); }

    if (
        session.university.toString() !== req.user._id.toString() &&
        session.instructor.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin'
    ) {
        logAuthorizationFailure(
            req.user._id.toString(),
            'start_session',
            req.params.id,
            `User not authorized: not instructor, university owner, or admin`
        );
        res.status(403); throw new Error('Not authorized to start this session');
    }
    if (session.status !== 'scheduled') {
        res.status(400); throw new Error('Only scheduled sessions can go live');
    }

    session.status = 'live';
    session.startTime = new Date();
    await session.save();

    await cacheSessionStatus(session._id.toString(), 'live');
    await invalidateSession(session._id.toString(), session.university.toString());

    // Notify students that session is live (socket + email)
    socketService.sendToUsers(
        session.enrolledStudents || [],
        'notification',
        {
            type: 'live_session_started',
            title: 'Session is Live!',
            message: `"${session.topic}" has started. Join now!`,
            sessionId: session._id
        }
    );

    // Send email notifications asynchronously
    setImmediate(async () => {
        try {
            const students = await User.find({
                _id: { $in: session.enrolledStudents || [] }
            }).select('name email profile phone').lean();

            for (const student of students) {
                notificationService.send(
                    {
                        _id: student._id,
                        name: student.name,
                        email: student.email,
                        phone: student.profile?.phone || student.phone
                    },
                    'liveSessionStarted',
                    {
                        topic: session.topic,
                        startTime: session.startTime,
                        sessionId: session._id
                    }
                ).catch(err => console.error(`[Session Start Notif] Error for ${student.email}:`, err.message));
            }
        } catch (err) {
            console.error('[Session Start Notification Error]:', err);
        }
    });

    res.json({ message: 'Session is now live', session });
});

/* ─────────────────────────────────────────────────────────────
   5. END SESSION  PUT /api/sessions/:id/end
──────────────────────────────────────────────────────────────*/
const endSession = asyncHandler(async (req, res) => {
    const session = await LiveSession.findById(req.params.id);
    if (!session || session.isDeleted) { res.status(404); throw new Error('Not found'); }
    if (
        session.university.toString() !== req.user._id.toString() &&
        session.instructor.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin'
    ) {
        logAuthorizationFailure(
            req.user._id.toString(),
            'end_session',
            req.params.id,
            `User not authorized: not instructor, university owner, or admin`
        );
        res.status(403); throw new Error('Not authorized to end this session');
    }

    session.status = 'ended';
    session.endTime = new Date();

    await session.save();
    await cacheSessionStatus(session._id.toString(), 'ended');
    await invalidateSession(session._id.toString(), session.university.toString());

    // Finalize metrics in background (Requirement 12.4)
    finalizeSessionMetrics(session._id.toString()).catch((err) => {
        console.error('[Metrics] Error finalizing metrics:', err.message);
    });

    // Trigger recording sync in background (don't block response)
    syncZoomRecordings(session._id.toString()).catch((err) => {
        console.error('[Zoom] Recording sync error:', err.message);
    });

    res.json({ message: 'Session ended', session });
});

/* ─────────────────────────────────────────────────────────────
   7. SEND NOTIFICATIONS  POST /api/sessions/:id/notify
──────────────────────────────────────────────────────────────*/
const sendNotification = asyncHandler(async (req, res) => {
    const session = await LiveSession.findById(req.params.id)
        .populate('enrolledStudents', 'name email profile phone');
    if (!session || session.isDeleted) { res.status(404); throw new Error('Not found'); }
    if (session.university.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        res.status(403); throw new Error('Not authorized');
    }

    const notificationsAdded = [];
    let alreadySent = 0;

    for (const student of session.enrolledStudents) {
        const sid = student._id.toString();
        const sent = await wasNotifSent(session._id.toString(), sid);
        if (sent) { alreadySent++; continue; }

        notificationService.send(
            {
                name: student.name,
                email: student.email,
                phone: student.profile?.phone || student.phone
            },
            'liveSession',
            { topic: session.topic, startTime: session.startTime }
        ).catch(err => console.error(`[Manual Session Notif] Engine Error:`, err.message));

        notificationsAdded.push({ student: student._id, channel: 'email', delivered: true });
        await markNotifSent(session._id.toString(), sid);
    }


    if (notificationsAdded.length > 0) {
        session.notifications.push(...notificationsAdded);
        session.notificationSentAt = new Date();
        await session.save();

        // Real-time: Alert users instantly
        const studentIds = notificationsAdded.map(n => n.student.toString());
        socketService.sendToUsers(
            studentIds,
            'notification',
            {
                type: 'urgent_alert',
                title: 'Live Session Alert',
                message: `Session "${session.topic}" is starting soon or updated!`,
                sessionId: session._id
            }
        );
    }

    res.json({
        message: 'Notifications dispatched',
        sent: notificationsAdded.length,
        skipped: alreadySent,
        totalReach: session.enrolledStudents.length,
    });
});

/* ─────────────────────────────────────────────────────────────
   8. UPDATE  PUT /api/sessions/:id
──────────────────────────────────────────────────────────────*/
const updateSession = asyncHandler(async (req, res) => {
    const session = await LiveSession.findById(req.params.id)
        .populate('enrolledStudents', 'name email');
    if (!session || session.isDeleted) { res.status(404); throw new Error('Not found'); }
    if (session.university.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        res.status(403); throw new Error('Not authorized');
    }

    const oldStartTime = session.startTime?.toISOString();
    const oldTopic = session.topic;
    const oldLink = session.meetingLink;

    const allowed = ['topic', 'description', 'category', 'tags', 'startTime', 'duration', 'timezone', 'enrolledStudents', 'meetingLink', 'status'];
    allowed.forEach((f) => { if (req.body[f] !== undefined) session[f] = req.body[f]; });

    await session.save();

    // Check if we should notify students about critical changes
    const timeChanged = req.body.startTime && new Date(req.body.startTime).toISOString() !== oldStartTime;
    const topicChanged = req.body.topic && req.body.topic !== oldTopic;
    const linkChanged = req.body.meetingLink && req.body.meetingLink !== oldLink;

    if (timeChanged || topicChanged || linkChanged) {
        // Send updates asynchronously
        notifySessionUpdate(session, {
            timeChanged,
            topicChanged,
            linkChanged
        }).catch(err => console.error('Failed to notify session update:', err));
    }

    await invalidateSession(session._id.toString(), session.university.toString());
    res.json(session);
});

// Helper for sending update emails
const notifySessionUpdate = async (session, changes) => {
    const populatedSession = await LiveSession.findById(session._id)
        .populate('enrolledStudents', 'name email profile phone');

    if (!populatedSession || populatedSession.enrolledStudents.length === 0) return;

    const { timeChanged, topicChanged, linkChanged } = changes;

    let updateSummary = 'The following details have been updated:';
    if (topicChanged) updateSummary += `\n- Topic: ${populatedSession.topic}`;
    if (timeChanged) updateSummary += `\n- New Time: ${new Date(populatedSession.startTime).toLocaleString()}`;
    if (linkChanged) updateSummary += `\n- The meeting link has been updated.`;

    for (const student of populatedSession.enrolledStudents) {
        // Use central notification service for synchronized Email + WhatsApp
        notificationService.send(
            {
                _id: student._id,
                name: student.name,
                email: student.email,
                phone: student.profile?.phone || student.phone
            },
            'liveSessionUpdate', // We'll add this type to NotificationService
            {
                topic: populatedSession.topic,
                startTime: populatedSession.startTime,
                changes
            }
        ).catch(err => console.error(`[Update Notif] Error for ${student.email}:`, err.message));
    }
};

/* ─────────────────────────────────────────────────────────────
   9. DELETE  DELETE /api/sessions/:id
──────────────────────────────────────────────────────────────*/
const deleteSession = asyncHandler(async (req, res) => {
    const session = await LiveSession.findById(req.params.id);
    if (!session || session.isDeleted) { res.status(404); throw new Error('Not found'); }
    if (session.university.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        res.status(403); throw new Error('Not authorized');
    }

    session.isDeleted = true;
    session.status = 'cancelled';
    await session.save();
    await invalidateSession(session._id.toString(), session.university.toString());
    res.json({ message: 'Session cancelled' });
});

/* ─────────────────────────────────────────────────────────────
   10. STATUS (lightweight)  GET /api/sessions/:id/status
──────────────────────────────────────────────────────────────*/
const getSessionStatusRoute = asyncHandler(async (req, res) => {
    const cached = await getSessionStatus(req.params.id);
    if (cached) return res.json(cached);
    const session = await LiveSession.findById(req.params.id).select('status').lean();
    if (!session) { res.status(404); throw new Error('Not found'); }
    await cacheSessionStatus(req.params.id, session.status);
    res.json({ status: session.status });
});

/* ─────────────────────────────────────────────────────────────
   11. RECORDING STATUS  GET /api/sessions/:id/recording
──────────────────────────────────────────────────────────────*/
const getRecordingStatus = asyncHandler(async (req, res) => {
    const session = await LiveSession.findById(req.params.id)
        .select('recording zoom bunny status university enrolledStudents tags').lean();
    if (!session) { res.status(404); throw new Error('Not found'); }
    if (!canViewSession(req.user, session)) {
        logAuthorizationFailure(
            req.user._id.toString(),
            'get_recording_status',
            req.params.id,
            `User not authorized to view recording status`
        );
        return res.status(403).json({ message: 'Access denied' });
    }

    // Backward compatibility: Check if this is a legacy Bunny session
    const isLegacySession = session.tags?.includes('legacy-bunny') ||
        (session.bunny?.videoId && !session.zoom?.meetingId);

    if (isLegacySession) {
        // Return Bunny recording data if available
        if (session.recording?.bunnyVideoId) {
            return res.json({
                ...session.recording,
                isLegacy: true,
                message: 'This is a legacy Bunny.net recording'
            });
        }
        return res.json({
            status: 'pending',
            isLegacy: true,
            message: 'Legacy Bunny.net session - recording may be available in the old system'
        });
    }

    /* Sync from Zoom if still processing */
    if (session.recording?.status === 'processing' && session.zoom?.meetingId) {
        try {
            // Trigger sync for processing recordings
            await syncZoomRecordings(req.params.id);

            // Fetch updated session data
            const updatedSession = await LiveSession.findById(req.params.id)
                .select('recording').lean();

            return res.json(updatedSession.recording || { status: 'pending' });
        } catch (error) {
            console.error('Error syncing Zoom recordings:', error.message);
            // Return current recording status even if sync fails
        }
    }

    res.json(session.recording || { status: 'pending' });
});

/* ─────────────────────────────────────────────────────────────
   12. GET RECORDING PLAYBACK URL  GET /api/sessions/:id/recording/playback
   Returns Zoom recording play URL and download URL
──────────────────────────────────────────────────────────────*/
const getRecordingPlaybackUrl = asyncHandler(async (req, res) => {
    const session = await LiveSession.findById(req.params.id)
        .select('recording zoom bunny status university instructor enrolledStudents tags').lean();

    if (!session) {
        res.status(404);
        throw new Error('Session not found');
    }

    // Verify user authorization to access recording
    if (!canViewSession(req.user, session)) {
        logAuthorizationFailure(
            req.user._id.toString(),
            'get_recording_playback_url',
            req.params.id,
            `User not authorized to view recording`
        );
        res.status(403);
        throw new Error('Access denied: You are not authorized to view this recording');
    }

    // Check if session has ended
    if (session.status !== 'ended') {
        res.status(400);
        throw new Error('Recording is only available for ended sessions');
    }

    // Backward compatibility: Check if this is a legacy Bunny session
    const isLegacySession = session.tags?.includes('legacy-bunny') ||
        (session.bunny?.videoId && !session.zoom?.meetingId);

    if (isLegacySession) {
        // Return Bunny recording data if available
        if (session.recording?.storagePath || session.bunny?.hlsPlaybackUrl) {
            return res.json({
                playUrl: session.recording?.storagePath || session.bunny?.hlsPlaybackUrl,
                downloadUrl: null, // Bunny recordings may not have download URLs
                recordingId: session.recording?.bunnyVideoId,
                status: session.recording?.status || 'ready',
                durationSecs: session.recording?.durationSecs,
                sizeBytes: session.recording?.sizeBytes,
                isLegacy: true,
                message: 'This is a legacy Bunny.net recording'
            });
        }

        res.status(404);
        throw new Error('Legacy Bunny.net recording not available. Please check the old system.');
    }

    // Check if recording exists
    if (!session.recording || !session.recording.playUrl) {
        res.status(404);
        throw new Error('Recording not available yet. Please check back later.');
    }

    // Return Zoom recording play URL and download URL
    res.json({
        playUrl: session.recording.playUrl,
        downloadUrl: session.recording.downloadUrl,
        recordingId: session.recording.recordingId,
        status: session.recording.status,
        durationMs: session.recording.durationMs,
        fileSizeBytes: session.recording.fileSizeBytes
    });
});

/* ─────────────────────────────────────────────────────────────
   13. GENERATE HOST SESSION LINK  GET /api/sessions/:id/host-link
   Returns a short-lived JWT-signed URL the instructor copies
   into their browser to open the Host Room page.
──────────────────────────────────────────────────────────────*/
const generateHostLink = asyncHandler(async (req, res) => {
    const session = await LiveSession.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!session) { res.status(404); throw new Error('Session not found'); }

    // Only the owning university or admin can get a host link
    if (
        session.university.toString() !== req.user._id.toString() &&
        session.instructor.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin'
    ) {
        res.status(403); throw new Error('Not authorized to generate a host link');
    }

    if (!['scheduled', 'live'].includes(session.status)) {
        res.status(400);
        throw new Error(`Cannot generate a host link for a session with status "${session.status}"`);
    }

    const HOST_LINK_TTL = 4 * 60 * 60; // 4 hours in seconds

    // Sign a compact JWT — does NOT replace the user's auth token.
    // It is only used to pre-populate the host room page.
    const hostToken = jwt.sign(
        {
            purpose: 'host_session',
            sessionId: session._id.toString(),
            id: session.instructor.toString(), // Use instructor's ID
            role: 'student', // Default role for protect middleware, 
            topic: session.topic,
        },
        process.env.JWT_SECRET,
        { expiresIn: `${HOST_LINK_TTL}s` }
    );

    const clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
    const hostUrl = `${clientOrigin}/host-room/${session._id}?token=${hostToken}`;

    res.json({
        hostUrl,
        expiresIn: HOST_LINK_TTL,          // seconds
        expiresAt: new Date(Date.now() + HOST_LINK_TTL * 1000).toISOString(),
        sessionId: session._id,
        topic: session.topic,
        status: session.status,
    });
});

/* ─────────────────────────────────────────────────────────────
   13. TRACK SESSION JOIN  POST /api/sessions/:id/join
   Track when a student joins a session via Zoom SDK
──────────────────────────────────────────────────────────────*/
const trackSessionJoin = asyncHandler(async (req, res) => {
    const session = await LiveSession.findById(req.params.id);
    if (!session || session.isDeleted) {
        res.status(404);
        throw new Error('Session not found');
    }

    // Verify user is authorized to join
    if (!canViewSession(req.user, session)) {
        logAuthorizationFailure(
            req.user._id.toString(),
            'track_session_join',
            req.params.id,
            'User not authorized to join this session'
        );
        res.status(403);
        throw new Error('Access denied: You are not authorized to join this session');
    }

    // Increment totalJoins counter (Requirement 12.1)
    session.metrics.totalJoins = (session.metrics.totalJoins || 0) + 1;

    // Track join time in Redis for watch time calculation
    const joinKey = `session:${req.params.id}:user:${req.user._id}:join`;
    const activeViewersKey = `session:${req.params.id}:active`;

    try {
        const r = redisCache.getRedis();
        if (r) {
            // Store join timestamp
            await r.set(joinKey, Date.now().toString(), { EX: 24 * 60 * 60 }); // 24 hour expiry

            // Add user to active viewers set
            await r.sAdd(activeViewersKey, req.user._id.toString());
            await r.expire(activeViewersKey, 24 * 60 * 60); // 24 hour expiry

            // Get current active viewer count
            const activeCount = await r.sCard(activeViewersKey);

            // Update peak viewers if current count is higher (Requirement 12.2)
            if (activeCount > (session.metrics.peakViewers || 0)) {
                session.metrics.peakViewers = activeCount;
            }
        }
    } catch (error) {
        console.warn('Redis error tracking join (non-fatal):', error.message);
    }

    await session.save();
    await invalidateSession(session._id.toString(), session.university.toString());

    res.json({
        message: 'Join tracked successfully',
        totalJoins: session.metrics.totalJoins,
        peakViewers: session.metrics.peakViewers
    });
});

/* ─────────────────────────────────────────────────────────────
   14. TRACK SESSION LEAVE  POST /api/sessions/:id/leave
   Track when a student leaves a session via Zoom SDK
──────────────────────────────────────────────────────────────*/
const trackSessionLeave = asyncHandler(async (req, res) => {
    const session = await LiveSession.findById(req.params.id);
    if (!session || session.isDeleted) {
        res.status(404);
        throw new Error('Session not found');
    }

    // Track leave time and calculate watch time
    const joinKey = `session:${req.params.id}:user:${req.user._id}:join`;
    const activeViewersKey = `session:${req.params.id}:active`;
    const watchTimesKey = `session:${req.params.id}:watchtimes`;

    try {
        const r = redisCache.getRedis();
        if (r) {
            // Get join timestamp
            const joinTimeStr = await r.get(joinKey);

            if (joinTimeStr) {
                const joinTime = parseInt(joinTimeStr, 10);
                const leaveTime = Date.now();
                const watchTimeSecs = Math.floor((leaveTime - joinTime) / 1000);

                // Store watch time for this user
                await r.hSet(watchTimesKey, req.user._id.toString(), watchTimeSecs.toString());
                await r.expire(watchTimesKey, 24 * 60 * 60); // 24 hour expiry

                // Remove join timestamp
                await r.del(joinKey);
            }

            // Remove user from active viewers set
            await r.sRem(activeViewersKey, req.user._id.toString());
        }
    } catch (error) {
        console.warn('Redis error tracking leave (non-fatal):', error.message);
    }

    res.json({ message: 'Leave tracked successfully' });
});

/* ─────────────────────────────────────────────────────────────
   15. FINALIZE SESSION METRICS  (Internal helper)
   Calculate and finalize metrics when session ends
──────────────────────────────────────────────────────────────*/
const finalizeSessionMetrics = async (sessionId) => {
    const watchTimesKey = `session:${sessionId}:watchtimes`;
    const activeViewersKey = `session:${sessionId}:active`;
    const joinKeyPattern = `session:${sessionId}:user:*:join`;

    try {
        const r = redisCache.getRedis();
        if (!r) {
            console.warn('Redis not available for metrics finalization');
            return;
        }

        // Get all watch times
        const watchTimes = await r.hGetAll(watchTimesKey);

        // Handle users still in session (calculate their watch time)
        const activeUsers = await r.sMembers(activeViewersKey);
        const endTime = Date.now();

        for (const userId of activeUsers) {
            const joinKey = `session:${sessionId}:user:${userId}:join`;
            const joinTimeStr = await r.get(joinKey);

            if (joinTimeStr) {
                const joinTime = parseInt(joinTimeStr, 10);
                const watchTimeSecs = Math.floor((endTime - joinTime) / 1000);
                watchTimes[userId] = watchTimeSecs.toString();
            }
        }

        // Calculate average watch time (Requirement 12.3)
        const watchTimeValues = Object.values(watchTimes).map(t => parseInt(t, 10));
        let avgWatchSecs = 0;

        if (watchTimeValues.length > 0) {
            const totalWatchTime = watchTimeValues.reduce((sum, time) => sum + time, 0);
            avgWatchSecs = Math.floor(totalWatchTime / watchTimeValues.length);
        }

        // Update session with finalized metrics
        const session = await LiveSession.findById(sessionId);
        if (session) {
            session.metrics.avgWatchSecs = avgWatchSecs;
            await session.save();
            console.log(`[Metrics] Session ${sessionId} finalized: totalJoins=${session.metrics.totalJoins}, peakViewers=${session.metrics.peakViewers}, avgWatchSecs=${avgWatchSecs}`);
        }

        // Clean up Redis keys
        await r.del(watchTimesKey);
        await r.del(activeViewersKey);

        // Clean up individual join keys
        const keys = await r.keys(joinKeyPattern);
        if (keys.length > 0) {
            await r.del(keys);
        }

    } catch (error) {
        console.error('Error finalizing session metrics:', error.message);
    }
};

/* ─────────────────────────────────────────────────────────────
   16. GET ZOOM SDK CONFIG  GET /api/sessions/:id/zoom-config
   Returns SDK configuration for joining a Zoom meeting
──────────────────────────────────────────────────────────────*/
const getZoomSDKConfig = asyncHandler(async (req, res) => {
    // Fetch session and verify it has Zoom meeting data
    const session = await LiveSession.findOne({ _id: req.params.id, isDeleted: false })
        .select('topic zoom bunny university instructor enrolledStudents tags')
        .lean();

    if (!session) {
        res.status(404);
        throw new Error('Session not found');
    }

    // Backward compatibility: Check if this is a legacy Bunny session
    const isLegacySession = session.tags?.includes('legacy-bunny') ||
        (session.bunny?.videoId && !session.zoom?.meetingId);

    if (isLegacySession) {
        res.status(400);
        throw new Error('This is a legacy session using Bunny.net streaming. Zoom SDK is not available for this session. Please use the legacy player.');
    }

    // Verify session has Zoom meeting data
    if (!session.zoom || !session.zoom.meetingNumber || !session.zoom.passcode) {
        res.status(400);
        throw new Error('Session does not have Zoom meeting data');
    }

    // Implement access control: verify user is instructor, university owner, or enrolled student
    const userId = req.user._id.toString();
    const isInstructor = session.instructor.toString() === userId;
    const isUniversityOwner = session.university.toString() === userId;
    const isEnrolledStudent = session.enrolledStudents?.some(
        (sid) => sid.toString() === userId
    );

    // If user is not authorized, return 403 Forbidden
    if (!isInstructor && !isUniversityOwner && !isEnrolledStudent && req.user.role !== 'admin') {
        logAuthorizationFailure(
            userId,
            'get_zoom_sdk_config',
            req.params.id,
            `User not authorized: not instructor, university owner, enrolled student, or admin`
        );
        res.status(403);
        throw new Error('Access denied: You are not authorized to join this session');
    }

    // Determine role: 1 for instructor/university/admin, 0 for students
    const role = (isInstructor || isUniversityOwner || req.user.role === 'admin') ? 1 : 0;

    // Generate signature using generateZoomSignature()
    let signature;
    try {
        signature = await generateZoomSignature(
            session.zoom.meetingNumber.toString(),
            role,
            req.params.id,
            userId
        );
    } catch (error) {
        console.error('[Zoom SDK] Signature generation failed:', error.message);
        res.status(500);
        throw new Error('Failed to generate Zoom SDK signature');
    }

    // Verify SDK key is configured
    if (!ZOOM_SDK_KEY) {
        console.error('[Zoom SDK] SDK key is not configured');
        res.status(500);
        throw new Error('Zoom SDK configuration error');
    }

    // Decrypt the passcode before sending to client
    let decryptedPasscode;
    try {
        decryptedPasscode = decryptPasscode(session.zoom.passcode);
    } catch (error) {
        console.error('[Zoom SDK] Passcode decryption failed:', error.message);
        res.status(500);
        throw new Error('Failed to decrypt meeting passcode');
    }

    // Return SDK config object with all required fields
    const sdkConfig = {
        sdkKey: ZOOM_SDK_KEY,
        meetingNumber: session.zoom.meetingNumber.toString(),
        passWord: decryptedPasscode,
        signature: signature,
        userName: req.user.name,
        userEmail: req.user.email,
        role: role,
        leaveUrl: `${CLIENT_URL}/sessions/${req.params.id}`
    };

    res.json(sdkConfig);
});

module.exports = {
    createSession,
    getSessions,
    getSession,
    startSession,
    endSession,
    sendNotification,
    updateSession,
    deleteSession,
    getSessionStatusRoute,
    getRecordingStatus,
    getRecordingPlaybackUrl,
    generateHostLink,
    getZoomSDKConfig,
    trackSessionJoin,
    trackSessionLeave,
};
