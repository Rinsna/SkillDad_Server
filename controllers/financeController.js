const Payout = require('../models/payoutModel');
const Payment = require('../models/paymentModel');
const User = require('../models/userModel');
const Course = require('../models/courseModel');
const Enrollment = require('../models/enrollmentModel');
const Transaction = require('../models/payment/Transaction');
const socketService = require('../services/SocketService');
const whatsAppService = require('../services/WhatsAppService');

// @desc    Get Global Finance Stats
// @route   GET /api/finance/stats
// @access  Private (Finance)
const getFinanceStats = async (req, res) => {
    try {
        // Calculate total revenue from approved manual payments
        const manualRevenueData = await Payment.aggregate([
            { $match: { status: 'approved' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const manualRevenue = manualRevenueData[0]?.total || 0;

        // Calculate total revenue from successful gateway transactions
        const gatewayRevenueData = await Transaction.aggregate([
            { $match: { status: 'success' } },
            { $group: { _id: null, total: { $sum: { $toDouble: '$finalAmount' } } } }
        ]);
        const gatewayRevenue = gatewayRevenueData[0]?.total || 0;

        const totalRevenue = manualRevenue + gatewayRevenue;

        // Get pending payouts
        const pendingPayouts = await Payout.find({ status: 'pending' }).populate('partner', 'name email');

        // Get approved payouts
        const approvedPayouts = await Payout.find({ status: 'approved' }).populate('partner', 'name email').sort('-payoutDate').limit(10);
        const approvedPayoutsCount = await Payout.countDocuments({ status: 'approved' });

        // Calculate total payouts amount
        const totalPayoutsAmount = await Payout.aggregate([
            { $match: { status: 'approved' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // Get payment counts
        const pendingPaymentsCount = await Payment.countDocuments({ status: 'pending' });
        const approvedPaymentsCount = await Payment.countDocuments({ status: 'approved' });

        // Get gateway success count
        const gatewaySuccessCount = await Transaction.countDocuments({ status: 'success' });

        const totalEnrollments = await Enrollment.countDocuments();

        res.json({
            totalRevenue,
            manualRevenue,
            gatewayRevenue,
            pendingPayouts,
            approvedPayouts,
            approvedPayoutsCount,
            totalPayoutsAmount: totalPayoutsAmount[0]?.total || 0,
            pendingPaymentsCount,
            approvedPaymentsCount: approvedPaymentsCount + gatewaySuccessCount,
            totalEnrollments,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all student payments with filters
// @route   GET /api/finance/payments
// @access  Private (Finance)
const getStudentPayments = async (req, res) => {
    try {
        const { status, partner, search, page = 1, limit = 50 } = req.query;

        let query = {};

        // Filter by status
        if (status && status !== 'all') {
            query.status = status;
        }

        // Filter by partner
        if (partner && partner !== 'all') {
            query.partner = partner;
        }

        // Search functionality
        if (search) {
            const students = await User.find({
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            }).select('_id');

            const courses = await Course.find({
                title: { $regex: search, $options: 'i' }
            }).select('_id');

            query.$or = [
                { student: { $in: students.map(s => s._id) } },
                { course: { $in: courses.map(c => c._id) } }
            ];
        }

        const payments = await Payment.find(query)
            .populate('student', 'name email')
            .populate('course', 'title')
            .populate('partner', 'name')
            .sort('-createdAt')
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Payment.countDocuments(query);

        res.json({
            payments,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            total: count
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Approve or Reject Student Payment
// @route   PUT /api/finance/payments/:id
// @access  Private (Finance)
const updatePaymentStatus = async (req, res) => {
    try {
        const { status, notes } = req.body;

        const payment = await Payment.findById(req.params.id)
            .populate('student', 'name email phone profile')
            .populate('course', 'title');

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        payment.status = status;
        payment.notes = notes || payment.notes;
        payment.reviewedBy = req.user._id;
        payment.reviewedAt = Date.now();

        await payment.save();

        // Activation Logic
        if (status === 'approved') {
            // Find or create enrollment
            let enrollment = await Enrollment.findOne({
                student: payment.student._id,
                course: payment.course._id
            });

            if (!enrollment) {
                enrollment = await Enrollment.create({
                    student: payment.student._id,
                    course: payment.course._id,
                    status: 'active',
                    enrollmentDate: Date.now()
                });
            } else {
                enrollment.status = 'active';
                await enrollment.save();
            }

            // Real-time Notification
            if (socketService) {
                socketService.sendToUser(payment.student._id.toString(), 'notification', {
                    type: 'payment_approved',
                    title: 'Payment Approved',
                    message: `Your payment for ${payment.course.title} has been approved. You can now access the course.`,
                    courseId: payment.course._id
                });
            }

            // WhatsApp Notification
            const phone = payment.student.profile?.phone || payment.student.phone;
            if (phone && whatsAppService) {
                try {
                    await whatsAppService.sendMessage(phone, `Your payment for ${payment.course.title} has been approved! Login to SkillDad to start learning.`);
                } catch (err) {
                    console.error('[WhatsApp] Progress update failed:', err.message);
                }
            }
        }

        res.json(payment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get enrollment summaries by center/partner
// @route   GET /api/finance/enrollment-summaries
// @access  Private (Finance)
const getEnrollmentSummaries = async (req, res) => {
    try {
        // Get summaries grouped by partner
        const summaries = await Payment.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: 'partner',
                    foreignField: '_id',
                    as: 'partnerInfo'
                }
            },
            {
                $unwind: {
                    path: '$partnerInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $group: {
                    _id: {
                        partner: '$partner',
                        center: '$center'
                    },
                    partnerName: { $first: '$partnerInfo.name' },
                    center: { $first: '$center' },
                    totalEnrollments: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    pendingPayments: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    approvedPayments: {
                        $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                    },
                    rejectedPayments: {
                        $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    partner: '$_id.partner',
                    partnerName: 1,
                    center: 1,
                    totalEnrollments: 1,
                    totalAmount: 1,
                    pendingPayments: 1,
                    approvedPayments: 1,
                    rejectedPayments: 1
                }
            },
            {
                $sort: { totalAmount: -1 }
            }
        ]);

        res.json(summaries);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Approve or Reject Payout Request
// @route   PUT /api/finance/payouts/:id
// @access  Private (Finance)
const approvePayout = async (req, res) => {
    const { status, notes, screenshotUrl } = req.body;

    try {
        const payout = await Payout.findById(req.params.id);

        if (!payout) {
            return res.status(404).json({ message: 'Payout request not found' });
        }

        payout.status = status;
        payout.notes = notes || payout.notes;

        if (status === 'approved') {
            payout.payoutDate = Date.now();
            if (screenshotUrl) {
                payout.screenshotUrl = screenshotUrl;
            }
        }

        await payout.save();
        res.json(payout);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get payout history
// @route   GET /api/finance/payout-history
// @access  Private (Finance)
const getPayoutHistory = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        let query = {};
        if (status && status !== 'all') {
            query.status = status;
        }

        const payouts = await Payout.find(query)
            .populate('partner', 'name email')
            .sort('-createdAt')
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Payout.countDocuments(query);

        res.json({
            payouts,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            total: count
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Export financial report
// @route   GET /api/finance/export/:type
// @access  Private (Finance)
const exportReport = async (req, res) => {
    try {
        const { type } = req.params;
        const { startDate, endDate } = req.query;

        let data = {};

        switch (type) {
            case 'revenue': {
                const manualData = await Payment.aggregate([
                    {
                        $match: {
                            status: 'approved',
                            ...(startDate && endDate ? {
                                createdAt: {
                                    $gte: new Date(startDate),
                                    $lte: new Date(endDate)
                                }
                            } : {})
                        }
                    },
                    {
                        $group: {
                            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                            totalRevenue: { $sum: '$amount' },
                            count: { $sum: 1 }
                        }
                    }
                ]);

                const gatewayData = await Transaction.aggregate([
                    {
                        $match: {
                            status: 'success',
                            ...(startDate && endDate ? {
                                createdAt: {
                                    $gte: new Date(startDate),
                                    $lte: new Date(endDate)
                                }
                            } : {})
                        }
                    },
                    {
                        $group: {
                            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                            totalRevenue: { $sum: { $toDouble: '$finalAmount' } },
                            count: { $sum: 1 }
                        }
                    }
                ]);

                // Merge and sort
                const merged = {};
                [...manualData, ...gatewayData].forEach(item => {
                    if (!merged[item._id]) {
                        merged[item._id] = { _id: item._id, totalRevenue: 0, count: 0 };
                    }
                    merged[item._id].totalRevenue += item.totalRevenue;
                    merged[item._id].count += item.count;
                });

                data = Object.values(merged).sort((a, b) => a._id.localeCompare(b._id));
                break;
            }

            case 'payments':
                data = await Payment.find({
                    ...(startDate && endDate ? {
                        createdAt: {
                            $gte: new Date(startDate),
                            $lte: new Date(endDate)
                        }
                    } : {})
                })
                    .populate('student', 'name email')
                    .populate('course', 'title')
                    .populate('partner', 'name')
                    .sort('-createdAt');
                break;

            case 'payouts':
                data = await Payout.find({
                    ...(startDate && endDate ? {
                        createdAt: {
                            $gte: new Date(startDate),
                            $lte: new Date(endDate)
                        }
                    } : {})
                })
                    .populate('partner', 'name email')
                    .sort('-createdAt');
                break;

            case 'enrollments':
                data = await Payment.aggregate([
                    {
                        $group: {
                            _id: '$center',
                            totalEnrollments: { $sum: 1 },
                            totalAmount: { $sum: '$amount' },
                            pendingCount: {
                                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                            },
                            approvedCount: {
                                $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                            }
                        }
                    },
                    { $sort: { totalAmount: -1 } }
                ]);
                break;

            default:
                return res.status(400).json({ message: 'Invalid report type' });
        }

        res.json({
            type,
            data,
            generatedAt: new Date(),
            dateRange: { startDate, endDate }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getFinanceStats,
    getStudentPayments,
    updatePaymentStatus,
    getEnrollmentSummaries,
    approvePayout,
    getPayoutHistory,
    exportReport,
};
