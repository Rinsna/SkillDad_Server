const express = require('express');
const router = express.Router();
const {
    getGlobalStats,
    getAllUsers,
    inviteUser,
    updateUserRole,
    updateEntity,
    verifyUser,
    getPlatformAnalytics,
    getPartnerDetails,
    grantPermission,
    revokePermission,
    getAllStudents,
    getStudentDocuments,
    getStudentEnrollments,
    updateStudent,
    deleteStudent,
    getPartnerLogos,
    createPartnerLogo,
    updatePartnerLogo,
    deletePartnerLogo,
    getDirectors,
    createDirector,
    updateDirector,
    deleteDirector,
    getUniversities
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.user && req.user.role?.toLowerCase() === 'admin') {
        next();
    } else {
        return res.status(403).json({ message: 'Not authorized as an Admin' });
    }
};

router.get('/stats', protect, checkAdmin, getGlobalStats);
router.get('/analytics', protect, checkAdmin, getPlatformAnalytics);
router.get('/users', protect, checkAdmin, getAllUsers);
router.get('/universities', protect, checkAdmin, getUniversities);
// All users without pagination — used by B2B management
router.get('/users/all', protect, checkAdmin, async (req, res) => {
    try {
        const User = require('../models/userModel');
        const users = await User.find({}).select('-password').sort('-createdAt');
        res.json({ users });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});
router.put('/entities/:id', protect, checkAdmin, updateEntity);
router.get('/partners/:id', protect, checkAdmin, getPartnerDetails);
router.post('/users/invite', protect, checkAdmin, inviteUser);
router.put('/users/:id/role', protect, checkAdmin, updateUserRole);
router.put('/users/:id/verify', protect, checkAdmin, verifyUser);
router.put('/users/:id/grant-permission', protect, checkAdmin, grantPermission);
router.put('/users/:id/revoke-permission', protect, checkAdmin, revokePermission);

// Student Management Routes
router.get('/students', protect, checkAdmin, getAllStudents);
router.get('/students/:id/documents', protect, checkAdmin, getStudentDocuments);
router.get('/students/:id/enrollments', protect, checkAdmin, getStudentEnrollments);
router.put('/students/:id', protect, checkAdmin, updateStudent);
router.delete('/students/:id', protect, checkAdmin, deleteStudent);

// Partner Logo Management Routes
router.get('/partner-logos', protect, checkAdmin, getPartnerLogos);
router.post('/partner-logos', protect, checkAdmin, createPartnerLogo);
router.put('/partner-logos/:id', protect, checkAdmin, updatePartnerLogo);
router.delete('/partner-logos/:id', protect, checkAdmin, deletePartnerLogo);

// Director Management Routes
router.get('/directors', protect, checkAdmin, getDirectors);
router.post('/directors', protect, checkAdmin, createDirector);
router.put('/directors/:id', protect, checkAdmin, updateDirector);
router.delete('/directors/:id', protect, checkAdmin, deleteDirector);

module.exports = router;
