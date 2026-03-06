const express = require('express');
const router = express.Router();
const { fixAdminEnrollments } = require('../controllers/migrationController');
const { protect, authorize } = require('../middleware/authMiddleware');

// @route   POST /api/admin/migrations/fix-enrollments
// @desc    Fix admin enrollments by creating missing Progress records
// @access  Private (Admin only)
router.post('/fix-enrollments', protect, authorize('admin'), fixAdminEnrollments);

module.exports = router;
