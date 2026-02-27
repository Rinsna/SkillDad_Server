const express = require('express');
const router = express.Router();

const {
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
} = require('../controllers/liveSessionController');

const { protect, authorize } = require('../middleware/authMiddleware');

const {
    apiLimiter,
    createSessionLimiter,
    signedUrlLimiter,
    notifLimiter,
    redisRateLimiter,
} = require('../middleware/rateLimiter');

/*
 * RBAC Matrix
 * ─────────────────────────────────────────────────────────────
 * POST   /                      university, admin
 * GET    /                      university, admin, student
 * GET    /:id                   university, admin, student
 * PUT    /:id                   university, admin
 * DELETE /:id                   university, admin
 * PUT    /:id/start             university, admin
 * PUT    /:id/end               university, admin
 * GET    /:id/status            university, admin, student (lightweight)
 * POST   /:id/notify            university, admin
 * GET    /:id/recording         university, admin, student
 * GET    /:id/recording/playback university, admin, student
 */

// Apply global API rate limiter to all session routes
router.use(apiLimiter);

/* ── Collection routes ─────────────────────────────────────── */
router.route('/')
    .post(
        protect,
        authorize('university', 'admin'),
        createSessionLimiter,
        redisRateLimiter('session_create', 15 * 60 * 1000, 10), // 10/15min cross-process
        createSession
    )
    .get(
        protect,
        authorize('university', 'admin', 'student'),
        getSessions
    );

/* ── Item routes ───────────────────────────────────────────── */
router.route('/:id')
    .get(
        protect,
        authorize('university', 'admin', 'student'),
        getSession
    )
    .put(
        protect,
        authorize('university', 'admin'),
        updateSession
    )
    .delete(
        protect,
        authorize('university', 'admin'),
        deleteSession
    );

/* ── State machine ─────────────────────────────────────────── */
router.put(
    '/:id/start',
    protect,
    authorize('university', 'admin', 'student'),
    startSession
);

router.put(
    '/:id/end',
    protect,
    authorize('university', 'admin', 'student'),
    endSession
);

/* ── Lightweight status poll (students can poll every 30s) ─── */
router.get(
    '/:id/status',
    protect,
    authorize('university', 'admin', 'student'),
    getSessionStatusRoute
);

/* ── Notification dispatch ─────────────────────────────────── */
router.post(
    '/:id/notify',
    protect,
    authorize('university', 'admin'),
    notifLimiter,
    redisRateLimiter('session_notify', 24 * 60 * 60 * 1000, 5), // 5/day cross-process
    sendNotification
);

/* ── Host session link (university + admin only) ──────────────*/
router.get(
    '/:id/host-link',
    protect,
    authorize('university', 'admin', 'student'),
    generateHostLink
);

/* ── Recording status ──────────────────────────────────────── */
router.get(
    '/:id/recording',
    protect,
    authorize('university', 'admin', 'student'),
    getRecordingStatus
);

/* ── Recording playback URL ────────────────────────────────── */
router.get(
    '/:id/recording/playback',
    protect,
    authorize('university', 'admin', 'student'),
    getRecordingPlaybackUrl
);

/* ── Zoom SDK configuration ────────────────────────────────── */
router.get(
    '/:id/zoom-config',
    protect,
    authorize('university', 'admin', 'student'),
    getZoomSDKConfig
);

/* ── Track session join (metrics) ──────────────────────────── */
router.post(
    '/:id/join',
    protect,
    authorize('university', 'admin', 'student'),
    trackSessionJoin
);

/* ── Track session leave (metrics) ─────────────────────────── */
router.post(
    '/:id/leave',
    protect,
    authorize('university', 'admin', 'student'),
    trackSessionLeave
);

module.exports = router;
