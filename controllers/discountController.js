const Discount = require('../models/discountModel');

// @desc    Validate a discount code
// @route   POST /api/discount/validate
// @access  Protected
const validateDiscount = async (req, res) => {
    try {
        const { code, courseId } = req.body;

        if (!code) {
            return res.status(400).json({ message: 'Discount code is required' });
        }

        const discount = await Discount.findOne({
            code: code.toUpperCase(),
            isActive: true,
            $or: [
                { expiryDate: { $gt: new Date() } },
                { expiryDate: null },
                { expiryDate: { $exists: false } }
            ]
        });

        if (!discount) {
            return res.status(404).json({ message: 'Invalid or expired discount code' });
        }

        res.json(discount);
    } catch (error) {
        console.error('Discount validation error:', error);
        res.status(500).json({ message: 'Server error validating discount code' });
    }
};

// @desc    Create a new discount code
// @route   POST /api/discount
// @access  Protected/Admin
const createDiscount = async (req, res) => {
    try {
        const { code, type, value, expiryDate } = req.body;

        const discountExists = await Discount.findOne({ code: code.toUpperCase() });

        if (discountExists) {
            return res.status(400).json({ message: 'Discount code already exists' });
        }

        const discount = await Discount.create({
            code: code.toUpperCase(),
            type: type || 'percentage',
            value,
            expiryDate: expiryDate || null,
        });

        res.status(201).json(discount);
    } catch (error) {
        console.error('Create discount error:', error);
        res.status(500).json({ message: 'Server error creating discount code' });
    }
};

// @desc    Get all discount codes
// @route   GET /api/discount
// @access  Protected/Admin
const getDiscounts = async (req, res) => {
    try {
        const discounts = await Discount.find({}).sort({ createdAt: -1 });
        res.json(discounts);
    } catch (error) {
        console.error('Get discounts error:', error);
        res.status(500).json({ message: 'Server error fetching discounts' });
    }
};

module.exports = { validateDiscount, createDiscount, getDiscounts };
