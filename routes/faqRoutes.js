const express = require('express');
const router = express.Router();
const {
    getFAQs,
    getFAQById,
    createFAQ,
    updateFAQ,
    deleteFAQ,
    submitFeedback,
    getAnalytics,
    incrementView,
    clearAnalytics
} = require('../controllers/faqController');
const { protect } = require('../middleware/authMiddleware');

const checkAdmin = (req, res, next) => {
    if (req.user && req.user.role?.toLowerCase() === 'admin') {
        next();
    } else {
        return res.status(403).json({ message: 'Not authorized as an Admin' });
    }
};

// Public routes
router.get('/', getFAQs);
router.post('/:id/feedback', submitFeedback);
router.post('/:id/view', incrementView);

// Admin routes
router.get('/analytics/stats', protect, checkAdmin, getAnalytics);
router.delete('/analytics/clear', protect, checkAdmin, clearAnalytics);
router.post('/', protect, checkAdmin, createFAQ);
router.put('/:id', protect, checkAdmin, updateFAQ);
router.delete('/:id', protect, checkAdmin, deleteFAQ);

// ID GET route after specific endpoints
router.get('/:id', getFAQById);

module.exports = router;
