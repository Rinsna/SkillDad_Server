const express = require('express');
const router = express.Router();
const { enrollInCourse, getMyCourses, updateProgress } = require('../controllers/enrollmentController');
const { protect } = require('../middleware/authMiddleware');

router.post('/:courseId', protect, enrollInCourse);
router.get('/my-courses', protect, getMyCourses);
router.put('/progress', protect, updateProgress);

module.exports = router;
