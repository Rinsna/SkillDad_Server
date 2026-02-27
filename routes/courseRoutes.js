const express = require('express');
const router = express.Router();
const {
    getCourses,
    getCourse,
    createCourse,
    updateCourse,
    deleteCourse,
    addModule,
    addVideo,
    addExercise,
    getAdminCourses
} = require('../controllers/courseController');
const {
    linkZoomRecordingToVideo,
    getAvailableZoomRecordings,
    unlinkZoomRecordingFromVideo,
} = require('../controllers/courseZoomController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').get(getCourses).post(protect, createCourse);
router.route('/admin').get(protect, getAdminCourses);
router.route('/zoom-recordings/available').get(protect, getAvailableZoomRecordings);
router.route('/:id').get(getCourse).put(protect, updateCourse).delete(protect, deleteCourse);
router.route('/:id/modules').post(protect, addModule);
router.route('/:id/modules/:moduleId/videos').post(protect, addVideo);
router.route('/:id/modules/:moduleId/videos/:videoId/exercises').post(protect, addExercise);
router.route('/:courseId/modules/:moduleIndex/videos/:videoIndex/link-zoom-recording').post(protect, linkZoomRecordingToVideo);
router.route('/:courseId/modules/:moduleIndex/videos/:videoIndex/unlink-zoom-recording').delete(protect, unlinkZoomRecordingFromVideo);

module.exports = router;
