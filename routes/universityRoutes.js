const express = require('express');
const router = express.Router();
const { getDashboardStats, createGroup, getGroups, addStudentToGroup, createDiscount, getDiscounts, deleteDiscount } = require('../controllers/universityController');
const { protect, authorize } = require('../middleware/authMiddleware'); // Need to implement authorize if not present, or checking role in controller

// Middleware to check if user is university
const checkUniversity = (req, res, next) => {
    if (req.user && req.user.role?.toLowerCase() === 'university') {
        next();
    } else {
        res.status(401);
        throw new Error('Not authorized as an University Partner');
    }
};

router.get('/stats', protect, checkUniversity, getDashboardStats);
router.route('/groups')
    .post(protect, checkUniversity, createGroup)
    .get(protect, checkUniversity, getGroups);

router.post('/groups/:groupId/add-student', protect, checkUniversity, addStudentToGroup);

router.route('/discounts')
    .post(protect, checkUniversity, createDiscount)
    .get(protect, checkUniversity, getDiscounts);

router.delete('/discounts/:id', protect, checkUniversity, deleteDiscount);

module.exports = router;
