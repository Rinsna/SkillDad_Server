const express = require('express');
const router = express.Router();
const {
    getFinanceStats,
    getStudentPayments,
    updatePaymentStatus,
    getEnrollmentSummaries,
    approvePayout,
    getPayoutHistory,
    exportReport
} = require('../controllers/financeController');
const { protect, authorize } = require('../middleware/authMiddleware');

const checkFinanceOrAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, no user' });
    }
    const role = req.user.role?.toLowerCase();
    console.log(`[FINANCE CHECK] User ${req.user.email} role: ${role}`);

    if (role === 'finance' || role === 'admin') {
        next();
    } else {
        console.warn(`[FINANCE DENIED] User ${req.user.email} is ${role}, not finance/admin`);
        res.status(403).json({
            message: 'Not authorized as Finance or Admin',
            detected: role
        });
    }
};

router.get('/stats', protect, checkFinanceOrAdmin, getFinanceStats);
router.get('/payments', protect, checkFinanceOrAdmin, getStudentPayments);
router.put('/payments/:id', protect, checkFinanceOrAdmin, updatePaymentStatus);
router.get('/enrollment-summaries', protect, checkFinanceOrAdmin, getEnrollmentSummaries);

// Payout Management
router.get('/payouts', protect, checkFinanceOrAdmin, getPayoutHistory);
router.put('/payouts/:id', protect, checkFinanceOrAdmin, approvePayout);
router.put('/payouts/:id/approve', protect, checkFinanceOrAdmin, async (req, res) => {
    req.body.status = 'approved';
    await approvePayout(req, res);
});
router.put('/payouts/:id/reject', protect, checkFinanceOrAdmin, async (req, res) => {
    req.body.status = 'rejected';
    await approvePayout(req, res);
});

router.get('/payout-history', protect, checkFinanceOrAdmin, getPayoutHistory);
router.get('/export/:type', protect, checkFinanceOrAdmin, exportReport);

module.exports = router;
