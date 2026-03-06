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
                { course: { $in: courses.map(c => c._id) } },
                { transactionId: { $regex: search, $options: 'i' } }
            ];
        }

        // Fetch manual payments
        const manualPayments = await Payment.find(query)
            .populate('student', 'name email')
            .populate('course', 'title price')
            .populate('partner', 'name')
            .lean();

        // Fetch gateway transactions that resulted in success
        let transactionQuery = {};
        if (status && status !== 'all') {
            if (status === 'approved') transactionQuery.status = 'success';
            else if (status === 'pending') transactionQuery.status = 'pending';
            else if (status === 'rejected') transactionQuery.status = 'failed';
        } else {
            transactionQuery.status = { $in: ['success', 'pending', 'failed'] };
        }

        if (partner && partner !== 'all') {
            const studentsOfPartner = await User.find({
                $or: [
                    { registeredBy: partner },
                    { universityId: partner }
                ]
            }).select('_id');
            transactionQuery.student = { $in: studentsOfPartner.map(s => s._id) };
        }

        if (search) {
            // Re-use student/course IDs from above
            const students = await User.find({
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            }).select('_id');

            const courses = await Course.find({
                title: { $regex: search, $options: 'i' }
            }).select('_id');

            const searchConditions = [
                { student: { $in: students.map(s => s._id) } },
                { course: { $in: courses.map(c => c._id) } },
                { transactionId: { $regex: search, $options: 'i' } }
            ];

            if (transactionQuery.student) {
                // If already filtering by partner, we need to intersect
                transactionQuery.$and = [
                    { student: transactionQuery.student },
                    { $or: searchConditions }
                ];
                delete transactionQuery.student;
            } else {
                transactionQuery.$or = searchConditions;
            }
        }

        const gatewayTransactions = await Transaction.find(transactionQuery)
            .populate({
                path: 'student',
                select: 'name email registeredBy universityId',
                populate: [
                    { path: 'registeredBy', select: 'name profile.partnerName' },
                    { path: 'universityId', select: 'name profile.universityName' }
                ]
            })
            .populate('course', 'title price')
            .lean();

        // Map transactions to payment format
        const mappedTransactions = gatewayTransactions.map(t => {
            const student = t.student || {};
            const partnerUser = student.universityId || student.registeredBy;
            const partnerInfo = partnerUser ? {
                _id: partnerUser._id,
                name: partnerUser.profile?.universityName || partnerUser.profile?.partnerName || partnerUser.name
            } : null;

            return {
                _id: t._id,
                student: {
                    _id: student._id,
                    name: student.name,
                    email: student.email
                },
                course: t.course,
                amount: t.finalAmount ? parseFloat(t.finalAmount.toString()) : 0,
                status: t.status === 'success' ? 'approved' : t.status === 'failed' ? 'rejected' : 'pending',
                paymentMethod: t.paymentMethod || 'gateway',
                transactionId: t.transactionId,
                partner: partnerInfo,
                createdAt: t.createdAt,
                isGateway: true
            };
        });

        // Combine and sort
        let allPayments = [...manualPayments, ...mappedTransactions];
        allPayments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Manual Pagination
        const total = allPayments.length;
        const paginatedPayments = allPayments.slice((page - 1) * limit, page * limit);

        res.json({
            payments: paginatedPayments,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error in getStudentPayments:', error);
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

            // Ensure Progress record exists for the student to see the course
            const Progress = require('../models/progressModel');
            let progress = await Progress.findOne({
                user: payment.student._id,
                course: payment.course._id
            });

            if (!progress) {
                await Progress.create({
                    user: payment.student._id,
                    course: payment.course._id,
                    completedVideos: [],
                    completedExercises: [],
                    projectSubmissions: [],
                });
                console.log(`[Finance] Created progress record for student ${payment.student._id} in course ${payment.course._id}`);
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
        // Get summaries from manual payments
        const manualSummaries = await Payment.aggregate([
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
            }
        ]);

        // Get summaries from gateway transactions
        const gatewayTransactions = await Transaction.find({ status: 'success' })
            .populate({
                path: 'student',
                select: 'registeredBy universityId',
                populate: [
                    { path: 'registeredBy', select: 'name profile.partnerName' },
                    { path: 'universityId', select: 'name profile.universityName' }
                ]
            })
            .lean();

        // Process gateway transactions into the same format
        const gatewaySummariesMap = {};

        gatewayTransactions.forEach(t => {
            const student = t.student || {};
            const university = student.universityId;
            const partner = student.registeredBy;

            let centerName = 'Online/Direct';
            let partnerId = null;
            let partnerName = 'Direct';

            if (university) {
                centerName = university.profile?.universityName || university.name;
                partnerId = university._id.toString();
                partnerName = university.name;
            } else if (partner) {
                centerName = partner.profile?.partnerName || partner.name || 'Partner Network';
                partnerId = partner._id.toString();
                partnerName = partner.name;
            }

            const key = `${partnerId}-${centerName}`;
            if (!gatewaySummariesMap[key]) {
                gatewaySummariesMap[key] = {
                    partner: partnerId,
                    partnerName,
                    center: centerName,
                    totalEnrollments: 0,
                    totalAmount: 0,
                    pendingPayments: 0,
                    approvedPayments: 0,
                    rejectedPayments: 0
                };
            }

            const amount = t.finalAmount ? parseFloat(t.finalAmount.toString()) : 0;
            gatewaySummariesMap[key].totalEnrollments += 1;
            gatewaySummariesMap[key].totalAmount += amount;
            gatewaySummariesMap[key].approvedPayments += 1;
        });

        // Merge manual and gateway summaries
        const finalSummariesMap = {};

        manualSummaries.forEach(s => {
            const partnerId = s._id.partner ? s._id.partner.toString() : 'null';
            const centerName = s.center || 'Direct';
            const key = `${partnerId}-${centerName}`;

            finalSummariesMap[key] = {
                partner: s._id.partner,
                partnerName: s.partnerName,
                center: centerName,
                totalEnrollments: s.totalEnrollments,
                totalAmount: s.totalAmount,
                pendingPayments: s.pendingPayments,
                approvedPayments: s.approvedPayments,
                rejectedPayments: s.rejectedPayments
            };
        });

        Object.values(gatewaySummariesMap).forEach(gs => {
            const partnerId = gs.partner ? gs.partner.toString() : 'null';
            const centerName = gs.center;
            const key = `${partnerId}-${centerName}`;

            if (finalSummariesMap[key]) {
                finalSummariesMap[key].totalEnrollments += gs.totalEnrollments;
                finalSummariesMap[key].totalAmount += gs.totalAmount;
                finalSummariesMap[key].approvedPayments += gs.approvedPayments;
            } else {
                finalSummariesMap[key] = gs;
            }
        });

        const sortedSummaries = Object.values(finalSummariesMap).sort((a, b) => b.totalAmount - a.totalAmount);

        res.json(sortedSummaries);
    } catch (error) {
        console.error('Error in getEnrollmentSummaries:', error);
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

            case 'payments': {
                const manualPayments = await Payment.find({
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
                    .lean();

                const gatewayPayments = await Transaction.find({
                    status: 'success',
                    ...(startDate && endDate ? {
                        createdAt: {
                            $gte: new Date(startDate),
                            $lte: new Date(endDate)
                        }
                    } : {})
                })
                    .populate('student', 'name email')
                    .populate('course', 'title')
                    .lean();

                const mappedGateway = gatewayPayments.map(t => ({
                    ...t,
                    amount: t.finalAmount ? parseFloat(t.finalAmount.toString()) : 0,
                    status: 'approved',
                    paymentMethod: t.paymentMethod || 'gateway',
                    isGateway: true
                }));

                data = [...manualPayments, ...mappedGateway].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            }

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

            case 'enrollments': {
                const manualEnrollments = await Payment.aggregate([
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
                    }
                ]);

                const gatewayEnrollments = await Transaction.aggregate([
                    { $match: { status: 'success' } },
                    {
                        $group: {
                            _id: 'Online Payment',
                            totalEnrollments: { $sum: 1 },
                            totalAmount: { $sum: { $toDouble: '$finalAmount' } },
                            pendingCount: { $sum: 0 },
                            approvedCount: { $sum: 1 }
                        }
                    }
                ]);

                data = [...manualEnrollments, ...gatewayEnrollments].sort((a, b) => b.totalAmount - a.totalAmount);
                break;
            }

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

// @desc    Get all partners and universities (for filtering)
// @route   GET /api/finance/partners
// @access  Private (Finance)
const getFinancePartners = async (req, res) => {
    try {
        const partners = await User.find({
            role: { $in: ['partner', 'university'] }
        }).select('_id name email role profile.universityName');

        res.json(partners);
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
    getFinancePartners
};
