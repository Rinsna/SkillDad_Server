const Enquiry = require('../models/enquiryModel');

// @desc    Create new enquiry
// @route   POST /api/enquiries
// @access  Public
const createEnquiry = async (req, res) => {
    const { name, email, phone, message } = req.body;

    if (!name || !email || !phone) {
        res.status(400);
        throw new Error('Please provide name, email and phone');
    }

    const enquiry = await Enquiry.create({
        name,
        email,
        phone,
        message,
    });

    if (enquiry) {
        res.status(201).json(enquiry);
    } else {
        res.status(400);
        throw new Error('Invalid enquiry data');
    }
};

// @desc    Get all enquiries
// @route   GET /api/enquiries
// @access  Private/Admin
const getEnquiries = async (req, res) => {
    const enquiries = await Enquiry.find({}).sort({ createdAt: -1 });
    res.json(enquiries);
};

module.exports = {
    createEnquiry,
    getEnquiries,
};
