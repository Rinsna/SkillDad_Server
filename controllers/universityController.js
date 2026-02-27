const User = require('../models/userModel');
const Group = require('../models/groupModel');
const Discount = require('../models/discountModel');
const LiveSession = require('../models/liveSessionModel');

// @desc    Get University Dashboard Stats
// @route   GET /api/university/stats
// @access  Private (University)
const getDashboardStats = async (req, res) => {
    try {
        const studentCount = await User.countDocuments({ universityId: req.user._id });
        const groupCount = await Group.countDocuments({ university: req.user._id });
        const liveSessionCount = await LiveSession.countDocuments({ university: req.user._id });

        res.json({
            studentCount,
            groupCount,
            liveSessions: liveSessionCount,
            avgScore: 78, // Placeholder until exam analytics are implemented
            activeCourses: 24, // Placeholder
            completionRate: 86 // Placeholder
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new Student Group
// @route   POST /api/university/groups
// @access  Private (University)
const createGroup = async (req, res) => {
    const { name, description } = req.body;

    try {
        const group = await Group.create({
            name,
            description,
            university: req.user.id,
            students: []
        });

        res.status(201).json(group);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get all groups for the university
// @route   GET /api/university/groups
// @access  Private (University)
const getGroups = async (req, res) => {
    try {
        const groups = await Group.find({ university: req.user.id }).populate('students', 'name email');
        res.json(groups);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Add a student to a group (and link to university)
// @route   POST /api/university/groups/:groupId/add-student
// @access  Private (University)
const addStudentToGroup = async (req, res) => {
    const { email } = req.body;
    const { groupId } = req.params;

    console.log(`[DEBUG] addStudentToGroup called. GroupID: ${groupId}, Email: ${email}`);

    try {
        // Validate input
        if (!email) {
            console.log('[DEBUG] Email missing in body');
            return res.status(400).json({ message: 'Email is required' });
        }

        // 1. Find the student
        const user = await User.findOne({ email });

        if (!user) {
            console.log(`[DEBUG] User not found for email: ${email}`);
            return res.status(404).json({ message: 'Student not found with this email' });
        }

        if (user.role !== 'student') {
            console.log(`[DEBUG] User found but role is: ${user.role}`);
            return res.status(400).json({ message: `User found but is a ${user.role}, not a student` });
        }

        const student = user;

        // 2. Find the group
        const group = await Group.findById(groupId);
        if (!group) {
            console.log(`[DEBUG] Group not found for ID: ${groupId}`);
            return res.status(404).json({ message: 'Group not found' });
        }

        // Check ownership
        if (group.university.toString() !== req.user.id) {
            console.log(`[DEBUG] Unauthorized access. Group Uni: ${group.university}, User Uni: ${req.user.id}`);
            return res.status(401).json({ message: 'Not authorized to modify this group' });
        }

        // 3. Link student to University if not already linked
        if (student.universityId && student.universityId.toString() !== req.user.id) {
            console.log(`[DEBUG] Student affiliated with other university: ${student.universityId}`);
            return res.status(400).json({ message: 'Student is already affiliated with another university' });
        }

        student.universityId = req.user.id;
        await student.save();

        // 4. Add to Group if not already in it
        if (group.students.includes(student._id)) {
            console.log('[DEBUG] Student already in group');
            return res.status(400).json({ message: 'Student is already in this group' });
        }

        group.students.push(student._id);
        await group.save();

        // Populate and return updated group
        const updatedGroup = await Group.findById(groupId).populate('students', 'name email');
        console.log('[DEBUG] Student added successfully');
        res.json({ message: 'Student added to group successfully', group: updatedGroup });

    } catch (error) {
        console.error('Error adding student to group:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
};

// @desc    Create a new discount code
// @route   POST /api/university/discounts
// @access  Private (University)
const createDiscount = async (req, res) => {
    const { code, value, percentage } = req.body;
    const discountValue = value || percentage;

    try {
        if (!code || !discountValue) {
            return res.status(400).json({ message: 'Code and value/percentage are required' });
        }

        const discountExists = await Discount.findOne({ code: code.toUpperCase() });

        if (discountExists) {
            return res.status(400).json({ message: 'Discount code already exists' });
        }

        const discount = await Discount.create({
            code: code.toUpperCase(),
            value: discountValue,
            type: 'percentage',
            partner: req.user.id,
        });

        res.status(201).json(discount);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get all discounts created by the university
// @route   GET /api/university/discounts
// @access  Private (University)
const getDiscounts = async (req, res) => {
    try {
        const discounts = await Discount.find({ partner: req.user.id });
        res.json(discounts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a discount code
// @route   DELETE /api/university/discounts/:id
// @access  Private (University)
const deleteDiscount = async (req, res) => {
    try {
        const discount = await Discount.findById(req.params.id);

        if (discount) {
            if (discount.partner.toString() !== req.user.id) {
                res.status(401);
                throw new Error('Not authorized to delete this discount');
            }
            await discount.deleteOne();
            res.json({ message: 'Discount removed' });
        } else {
            res.status(404);
            throw new Error('Discount not found');
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getDashboardStats,
    createGroup,
    getGroups,
    addStudentToGroup,
    createDiscount,
    getDiscounts,
    deleteDiscount
};
