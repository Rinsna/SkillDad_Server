const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const NotificationLog = require('../models/notificationLogModel');
const whatsAppService = require('../services/WhatsAppService');
const notificationService = require('../services/NotificationService');

// @desc    Get all notification logs (Admin only)
// @route   GET /api/notifications/logs
// @access  Private (Admin)
router.get('/logs', protect, authorize('admin'), async (req, res) => {
    try {
        const logs = await NotificationLog.find()
            .sort({ createdAt: -1 })
            .limit(100);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get service status
// @route   GET /api/notifications/status
// @access  Private (Admin)
router.get('/status', protect, authorize('admin'), async (req, res) => {
    res.json({
        whatsapp: {
            enabled: whatsAppService.isEnabled,
            provider: 'Interakt',
            baseUrl: whatsAppService.baseUrl
        },
        email: {
            enabled: true, // Assuming email is always active if configured
            provider: 'Nodemailer/SendGrid'
        }
    });
});

// @desc    Send test WhatsApp message
// @route   POST /api/notifications/test-whatsapp
// @access  Private (Admin)
router.post('/test-whatsapp', protect, authorize('admin'), async (req, res) => {
    const { phone } = req.body;
    try {
        const result = await whatsAppService.sendTemplateMessage(
            phone,
            'test_notification_v1',
            ['Admin Test User', 'SkillDad Engineering Hub']
        );
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
