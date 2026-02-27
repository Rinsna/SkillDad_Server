const Discount = require('../models/discountModel');
const User = require('../models/userModel');

// @desc    Get Partner Dashboard Stats
// @route   GET /api/partner/stats
// @access  Private (Partner)
const getPartnerStats = async (req, res) => {
    try {
        const discounts = await Discount.find({ partner: req.user.id });
        const totalCodes = discounts.length;

        // Sum of all usage
        const totalRedemptions = discounts.reduce((acc, curr) => acc + curr.usedCount, 0);

        // Mock earnings calculation (e.g., $10 per redemption)
        const totalEarnings = totalRedemptions * 10;

        res.json({
            totalCodes,
            totalRedemptions,
            totalEarnings
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new Discount Code
// @route   POST /api/partner/discounts
// @access  Private (Partner)
const createDiscount = async (req, res) => {
    const { code, value, percentage } = req.body;
    const discountValue = value || percentage;

    try {
        const discount = await Discount.create({
            code: code.toUpperCase(),
            value: discountValue,
            type: 'percentage',
            partner: req.user.id,
        });

        res.status(201).json(discount);
    } catch (error) {
        res.status(400).json({ message: 'Code already exists or invalid data' });
    }
};

const Payout = require('../models/payoutModel');

// @desc    Get all discounts for the partner
// @route   GET /api/partner/discounts
// @access  Private (Partner)
const getDiscounts = async (req, res) => {
    try {
        const discounts = await Discount.find({ partner: req.user.id }).sort('-createdAt');
        res.json(discounts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Request Payout
// @route   POST /api/partner/payout
// @access  Private (Partner)
const requestPayout = async (req, res) => {
    const { amount } = req.body;

    try {
        // In a real app, verify partner has enough earnings
        const payout = await Payout.create({
            partner: req.user.id,
            amount,
            status: 'pending',
        });

        res.status(201).json(payout);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get Students affiliated with the partner
// @route   GET /api/partner/students
// @access  Private (Partner)
const getPartnerStudents = async (req, res) => {
    try {
        // Find all discount codes owned by this partner
        const discounts = await Discount.find({ partner: req.user.id });
        const codes = discounts.map(d => d.code);

        // Find students who used any of these codes
        const students = await User.find({
            partnerCode: { $in: codes },
            role: 'student'
        }).select('-password');

        res.json(students);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Payout history
// @route   GET /api/partner/payouts
// @access  Private (Partner)
const getPayoutHistory = async (req, res) => {
    try {
        const payouts = await Payout.find({ partner: req.user.id }).sort('-createdAt');
        res.json(payouts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Register a student by Partner
// @route   POST /api/partner/register-student
// @access  Private (Partner)
const registerStudent = async (req, res) => {
    const { name, email, password, phone, partnerCode } = req.body;

    try {
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please provide name, email, and password' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Verify the partnerCode belongs to this partner
        if (partnerCode) {
            const discount = await Discount.findOne({ code: partnerCode.toUpperCase(), partner: req.user.id });
            if (!discount) {
                return res.status(400).json({ message: 'Invalid partner code for this account' });
            }
        }

        const student = await User.create({
            name,
            email,
            password,
            role: 'student',
            partnerCode: partnerCode?.toUpperCase(),
            isVerified: true,
            profile: {
                phone: phone || ''
            }
        });

        res.status(201).json({
            _id: student._id,
            name: student.name,
            email: student.email,
            partnerCode: student.partnerCode,
            message: 'Student registered successfully'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getPartnerStats,
    createDiscount,
    getDiscounts,
    requestPayout,
    getPartnerStudents,
    registerStudent,
    getPayoutHistory
};
