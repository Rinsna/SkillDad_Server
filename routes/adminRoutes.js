const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const {
    getGlobalStats,
    getAllUsers,
    getUserById,
    inviteUser,
    updateUserRole,
    updateEntity,
    verifyUser,
    getPlatformAnalytics,
    getPartnerDetails,
    getPartnerDiscounts,
    grantPermission,
    revokePermission,
    getAllStudents,
    getStudentDocuments,
    getStudentEnrollments,
    updateStudent,
    deleteStudent,
    deleteUser,
    getPartnerLogos,
    createPartnerLogo,
    updatePartnerLogo,
    deletePartnerLogo,
    getDirectors,
    createDirector,
    updateDirector,
    deleteDirector,
    getUniversities,
    assignCoursesToUniversity,
    getUniversityDetail,
    adminEnrollStudent,
    adminUnenrollStudent,
    uploadUniversityProfileImage,
    updateUniversityProfile
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');

const checkAdmin = (req, res, next) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const log = `[${new Date().toISOString()}] ADMIN CHECK - User: ${req.user ? req.user.email : 'UNDEFINED'}, Role: ${req.user ? req.user.role : 'N/A'}, URL: ${req.originalUrl}\n`;

        try {
            fs.appendFileSync(path.join(__dirname, '../debug_admin.log'), log);
        } catch (logErr) {
            // Silently ignore if logging fails (e.g. read-only filesystem)
            console.warn('[AdminCheck] Could not write to debug_admin.log:', logErr.message);
        }
    } catch (err) {
        console.error('[AdminCheck] Internal Error:', err);
    }

    if (req.user && req.user.role?.toLowerCase() === 'admin') {
        next();
    } else {
        return res.status(403).json({ message: 'Not authorized as an Admin [checkAdmin]' });
    }
};

router.get('/stats', protect, checkAdmin, getGlobalStats);
router.get('/analytics', protect, checkAdmin, getPlatformAnalytics);
router.get('/users', protect, checkAdmin, getAllUsers);
router.get('/users/:id', protect, checkAdmin, getUserById);
router.get('/universities', protect, checkAdmin, getUniversities);
router.get('/universities/:id', protect, checkAdmin, getUniversityDetail);
router.put('/universities/:id/courses', protect, checkAdmin, assignCoursesToUniversity);
router.put('/universities/:id/profile', protect, checkAdmin, updateUniversityProfile);
router.post('/universities/:id/upload-image', protect, checkAdmin, upload.single('profileImage'), uploadUniversityProfileImage);
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
router.get('/partners/:id/discounts', protect, checkAdmin, getPartnerDiscounts);
router.post('/users/invite', protect, checkAdmin, inviteUser);
router.put('/users/:id/role', protect, checkAdmin, updateUserRole);
router.put('/users/:id/verify', protect, checkAdmin, verifyUser);
router.put('/users/:id/grant-permission', protect, checkAdmin, grantPermission);
router.put('/users/:id/revoke-permission', protect, checkAdmin, revokePermission);
router.delete('/users/:id', protect, checkAdmin, deleteUser);

// Student Management Routes
router.get('/students', protect, checkAdmin, getAllStudents);
router.get('/students/:id/documents', protect, checkAdmin, getStudentDocuments);
router.get('/students/:id/enrollments', protect, checkAdmin, getStudentEnrollments);
router.post('/students/:id/enroll', protect, checkAdmin, adminEnrollStudent);
router.delete('/students/:id/enroll/:courseId', protect, checkAdmin, adminUnenrollStudent);
router.put('/students/:id', protect, checkAdmin, updateStudent);
router.delete('/students/:id', protect, checkAdmin, deleteStudent);

// Partner Logo Management Routes
router.get('/partner-logos', protect, checkAdmin, getPartnerLogos);
router.post('/partner-logos', protect, checkAdmin, createPartnerLogo);
router.post('/partner-logos/seed', protect, checkAdmin, async (req, res) => {
    // One-time seed endpoint for partner logos
    try {
        const PartnerLogo = require('../models/partnerLogoModel');

        const samplePartners = [
            { name: 'TechCorp Solutions', logo: '/assets/logos/techcorp.png', type: 'corporate', order: 1, isActive: true },
            { name: 'Global Innovations Ltd', logo: '/assets/logos/global-innovations.png', type: 'corporate', order: 2, isActive: true },
            { name: 'Digital Dynamics Inc', logo: '/assets/logos/digital-dynamics.png', type: 'corporate', order: 3, isActive: true },
            { name: 'Enterprise Systems Group', logo: '/assets/logos/enterprise-systems.png', type: 'corporate', order: 4, isActive: true },
            { name: 'CloudTech Partners', logo: '/assets/logos/cloudtech.png', type: 'corporate', order: 5, isActive: true },
            { name: 'DataFlow Corporation', logo: '/assets/logos/dataflow.png', type: 'corporate', order: 6, isActive: true },
            { name: 'NextGen Technologies', logo: '/assets/logos/nextgen.png', type: 'corporate', order: 7, isActive: true },
            { name: 'Smart Solutions International', logo: '/assets/logos/smart-solutions.png', type: 'corporate', order: 8, isActive: true },
            { name: 'Innovate Labs', logo: '/assets/logos/innovate-labs.png', type: 'corporate', order: 9, isActive: true }
        ];

        // Clear existing (optional)
        await PartnerLogo.deleteMany({});

        // Insert sample partners
        const inserted = await PartnerLogo.insertMany(samplePartners);

        res.json({
            success: true,
            message: `Successfully seeded ${inserted.length} partner logos`,
            partners: inserted.map(p => ({ name: p.name, order: p.order }))
        });
    } catch (error) {
        console.error('Seed error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
router.put('/partner-logos/:id', protect, checkAdmin, updatePartnerLogo);
router.delete('/partner-logos/:id', protect, checkAdmin, deletePartnerLogo);

// Director Management Routes
router.get('/directors', protect, checkAdmin, getDirectors);
router.post('/directors', protect, checkAdmin, createDirector);
router.put('/directors/:id', protect, checkAdmin, updateDirector);
router.delete('/directors/:id', protect, checkAdmin, deleteDirector);

module.exports = router;
