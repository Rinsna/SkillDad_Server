const express = require('express');
const router = express.Router();
const PartnerLogo = require('../models/partnerLogoModel');
const Director = require('../models/directorModel');
const User = require('../models/userModel');

// @desc    Get active partner logos for landing page
// @route   GET /api/public/partner-logos
// @access  Public
router.get('/partner-logos', async (req, res) => {
    try {
        const logos = await PartnerLogo.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
        // Handle null/undefined results by returning empty array
        res.json(logos || []);
    } catch (error) {
        // Log error for debugging database connection issues
        console.error('Error fetching partner logos:', error.message);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get active directors for landing page
// @route   GET /api/public/directors
// @access  Public
router.get('/directors', async (req, res) => {
    try {
        const directors = await Director.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
        // Handle null/undefined results by returning empty array
        res.json(directors || []);
    } catch (error) {
        // Log error for debugging database connection issues
        console.error('Error fetching directors:', error.message);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get all admin-approved universities (for partner student registration)
// @route   GET /api/public/universities
// @access  Public
router.get('/universities', async (req, res) => {
    try {
        const universities = await User.find({ 
            role: 'university',
            isVerified: true  // Only fetch admin-approved universities
        })
            .select('name email profile')
            .sort({ 'profile.universityName': 1, name: 1 });
        res.json(universities || []);
    } catch (error) {
        console.error('Error fetching universities:', error.message);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Send demo notifications
// @route   POST /api/public/demo-notification
// @access  Public
router.post('/demo-notification', require('../controllers/demoController').sendDemoNotification);

// @desc    Get recent notification logs
// @route   GET /api/public/notification-logs
// @access  Public
router.get('/notification-logs', require('../controllers/demoController').getNotificationLogs);

module.exports = router;


