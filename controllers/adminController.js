const User = require('../models/userModel');
const Course = require('../models/courseModel');
const Support = require('../models/supportModel');
const sendEmail = require('../utils/sendEmail');
const emailTemplates = require('../utils/emailTemplates');
const PartnerLogo = require('../models/partnerLogoModel');
const Director = require('../models/directorModel');
const Enrollment = require('../models/enrollmentModel');
const Document = require('../models/documentModel');

// @desc    Update entity (partner/university) details + discount rate
// @route   PUT /api/admin/entities/:id
// @access  Private (Admin)
const updateEntity = async (req, res) => {
    try {
        console.log('[updateEntity] body:', req.body, 'id:', req.params.id);
        const { name, email, role, discountRate } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'Entity not found' });
        }

        if (name && name.trim()) {
            const trimmedName = name.trim();
            user.name = trimmedName;

            // Sync with profile based on role
            if (user.role === 'partner') {
                if (!user.profile) user.profile = {};
                user.profile.partnerName = trimmedName;
            } else if (user.role === 'university') {
                if (!user.profile) user.profile = {};
                user.profile.universityName = trimmedName;
            }
        }
        if (email && email.trim()) user.email = email.trim();
        if (role) {
            const validRoles = ['student', 'university', 'partner', 'admin', 'finance'];
            const lowerRole = role.toLowerCase();
            if (!validRoles.includes(lowerRole)) {
                return res.status(400).json({ message: `Invalid role: ${role}` });
            }
            user.role = lowerRole;
        }
        if (discountRate !== undefined && discountRate !== null) {
            user.discountRate = Number(discountRate) || 0;
        }


        const saved = await user.save();
        console.log('[updateEntity] saved:', saved._id, saved.discountRate);

        return res.json({
            _id: saved._id,
            name: saved.name,
            email: saved.email,
            role: saved.role,
            discountRate: saved.discountRate,
            isVerified: saved.isVerified,
            message: 'Entity updated successfully'
        });
    } catch (error) {
        console.error('[updateEntity] error:', error);
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Email already in use by another account' });
        }
        return res.status(500).json({ message: error.message || 'Server error updating entity' });
    }
};

// @desc    Get Global Stats (Admin)
// @route   GET /api/admin/stats
// @access  Private (Admin)
const getGlobalStats = async (req, res) => {
    try {
        const [totalUsers, totalCourses, totalStudents, totalPartners, totalTickets] = await Promise.all([
            User.countDocuments(),
            Course.countDocuments(),
            User.countDocuments({ role: 'student' }),
            User.countDocuments({ role: 'partner' }),
            Support.countDocuments({ status: 'Open' })
        ]);

        // Revenue placeholder
        const totalRevenue = 12500;

        res.json({
            totalUsers,
            totalCourses,
            totalStudents,
            totalPartners,
            totalTickets,
            totalRevenue
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all users with pagination
// @route   GET /api/admin/users
// @access  Private (Admin)
const getAllUsers = async (req, res) => {
    const pageSize = 20;
    const page = Number(req.query.pageNumber) || 1;

    try {
        const count = await User.countDocuments({});
        const users = await User.find({})
            .limit(pageSize)
            .skip(pageSize * (page - 1))
            .select('-password'); // Exclude password

        res.json({ users, page, pages: Math.ceil(count / pageSize) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update user role & details
// @route   PUT /api/admin/users/:id/role
// @access  Private (Admin)
const updateUserRole = async (req, res) => {
    try {
        const { role, name, email, discountRate } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Role is optional — keep existing if not provided in request body
        const newRole = (role || user.role).toLowerCase();
        const validRoles = ['student', 'university', 'partner', 'admin', 'finance'];
        if (!validRoles.includes(newRole)) {
            return res.status(400).json({ message: 'Invalid role specified' });
        }

        user.role = newRole;

        if (name) {
            user.name = name;
            if (user.role === 'partner') {
                if (!user.profile) user.profile = {};
                user.profile.partnerName = name;
            } else if (user.role === 'university') {
                if (!user.profile) user.profile = {};
                user.profile.universityName = name;
            }
        }

        if (email) user.email = email;

        if (discountRate !== undefined) {
            user.discountRate = Number(discountRate);
        }

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            discountRate: updatedUser.discountRate,
            message: 'Partner details updated successfully'
        });
    } catch (error) {
        console.error('Update partner error:', error);
        res.status(500).json({
            message: error.code === 11000 ? 'Email already in use' : (error.message || 'Failed to update partner')
        });
    }
};



// @desc    Toggle user verification
// @route   PUT /api/admin/users/:id/verify
// @access  Private (Admin)
const verifyUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.isVerified = !user.isVerified;
        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            isVerified: updatedUser.isVerified,
            message: 'Verification status updated successfully'
        });
    } catch (error) {
        console.error('Verify user error:', error);
        res.status(500).json({ message: error.message || 'Failed to update verification status' });
    }
};

// @desc    Get B2B & Platform Analytics
// @route   GET /api/admin/analytics
// @access  Private (Admin)
const getPlatformAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let userQuery = {};

        if (startDate && endDate) {
            userQuery.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const userStats = await User.aggregate([
            { $match: userQuery },
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        // Mock logic for sources and revenue - scaling based on duration if dates provided
        let scaleFactor = 1;
        if (startDate && endDate) {
            const diffTime = Math.abs(new Date(endDate) - new Date(startDate));
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            scaleFactor = Math.max(0.1, Math.min(diffDays / 30, 2)); // Scale relative to a month
        }

        const enrollmentSources = [
            { source: 'Direct', count: Math.round(450 * scaleFactor) },
            { source: 'University', count: Math.round(320 * scaleFactor) },
            { source: 'Partner', count: Math.round(180 * scaleFactor) }
        ];

        res.json({
            userStats,
            enrollmentSources,
            revenueImpact: {
                direct: Math.round(12000 * scaleFactor),
                partner: Math.round(8500 * scaleFactor),
                university: Math.round(15400 * scaleFactor)
            }
        });
    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Partner Profile & Discount info
// @route   GET /api/admin/partners/:id
// @access  Private (Admin)
const getPartnerDetails = async (req, res) => {
    try {
        const partner = await User.findById(req.params.id).select('-password');
        if (partner) {
            // Fetch associated discounts/stats here
            res.json(partner);
        } else {
            res.status(404).json({ message: 'Partner not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Grant permission (verify + change role)
// @route   PUT /api/admin/users/:id/grant-permission
// @access  Private (Admin)
const grantPermission = async (req, res) => {
    try {
        const { role } = req.body;

        if (!role) {
            return res.status(400).json({ message: 'Role is required' });
        }

        const validRoles = ['student', 'university', 'partner', 'admin', 'finance'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ message: 'Invalid role specified' });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Grant permission: verify user and change role
        user.isVerified = true;
        user.role = role;

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            isVerified: updatedUser.isVerified,
            message: `Successfully granted ${role} permission`
        });
    } catch (error) {
        console.error('Grant permission error:', error);
        res.status(500).json({ message: error.message || 'Failed to grant permission' });
    }
};

// @desc    Revoke permission (unverify + set to student)
// @route   PUT /api/admin/users/:id/revoke-permission
// @access  Private (Admin)
const revokePermission = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Revoke permission: unverify and set to student
        user.isVerified = false;
        user.role = 'student';

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            isVerified: updatedUser.isVerified,
            message: 'Permission revoked successfully'
        });
    } catch (error) {
        console.error('Revoke permission error:', error);
        res.status(500).json({ message: error.message || 'Failed to revoke permission' });
    }
};


// @desc    Get all students with enrollment count
// @route   GET /api/admin/students
// @access  Private (Admin)
const getAllStudents = async (req, res) => {
    try {
        const { courseId } = req.query;

        let studentIds = null;
        if (courseId && courseId !== 'all') {
            const enrollments = await Enrollment.find({ course: courseId }).select('student');
            studentIds = enrollments.map(e => e.student);
        }

        const query = { role: 'student' };
        if (studentIds) {
            query._id = { $in: studentIds };
        }

        const students = await User.find(query)
            .populate('universityId', 'name profile')
            .select('-password')
            .sort('-createdAt');

        const studentsWithEnrollments = await Promise.all(
            students.map(async (student) => {
                const enrollmentCount = await Enrollment.countDocuments({ student: student._id });
                return {
                    ...student.toObject(),
                    enrollmentCount
                };
            })
        );

        res.json(studentsWithEnrollments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get student documents
// @route   GET /api/admin/students/:id/documents
// @access  Private (Admin)
const getStudentDocuments = async (req, res) => {
    try {
        const documents = await Document.find({ student: req.params.id });
        res.json(documents);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get student enrollments
// @route   GET /api/admin/students/:id/enrollments
// @access  Private (Admin)
const getStudentEnrollments = async (req, res) => {
    try {
        const Enrollment = require('../models/enrollmentModel');
        const enrollments = await Enrollment.find({ student: req.params.id })
            .populate({
                path: 'course',
                select: 'title thumbnail category instructor',
                populate: { path: 'instructor', select: 'name profile' }
            });
        res.json(enrollments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update student details
// @route   PUT /api/admin/students/:id
// @access  Private (Admin)
const updateStudent = async (req, res) => {
    try {
        const student = await User.findById(req.params.id);

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        if (student.role !== 'student') {
            return res.status(400).json({ message: 'User is not a student' });
        }

        student.name = req.body.name || student.name;
        student.email = req.body.email || student.email;
        student.bio = req.body.bio || student.bio;
        student.isVerified = req.body.isVerified !== undefined ? req.body.isVerified : student.isVerified;

        const updatedStudent = await student.save();

        res.json({
            _id: updatedStudent._id,
            name: updatedStudent.name,
            email: updatedStudent.email,
            bio: updatedStudent.bio,
            role: updatedStudent.role,
            isVerified: updatedStudent.isVerified
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete student
// @route   DELETE /api/admin/students/:id
// @access  Private (Admin)
const deleteStudent = async (req, res) => {
    try {
        const student = await User.findById(req.params.id);

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        if (student.role !== 'student') {
            return res.status(400).json({ message: 'User is not a student' });
        }

        await User.deleteOne({ _id: req.params.id });

        res.json({ message: 'Student deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Partner Logo Management

// @desc    Get all partner logos
// @route   GET /api/admin/partner-logos
// @access  Private (Admin)
async function getPartnerLogos(req, res) {
    try {
        const logos = await PartnerLogo.find().sort({ order: 1, createdAt: 1 });
        res.json(logos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Create partner logo
// @route   POST /api/admin/partner-logos
// @access  Private (Admin)
async function createPartnerLogo(req, res) {
    try {
        const { name, order, type, logo: logoUrl, location, students, programs } = req.body;

        const logo = await PartnerLogo.create({
            name,
            logo: logoUrl,
            type: type || 'corporate',
            location,
            students,
            programs,
            order: order || 0,
            isActive: true
        });

        res.status(201).json(logo);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Update partner logo
// @route   PUT /api/admin/partner-logos/:id
// @access  Private (Admin)
async function updatePartnerLogo(req, res) {
    try {
        const { name, order, isActive, type, logo: logoUrl, location, students, programs } = req.body;

        const logo = await PartnerLogo.findById(req.params.id);

        if (!logo) {
            return res.status(404).json({ message: 'Partner logo not found' });
        }

        logo.name = name || logo.name;
        logo.logo = logoUrl !== undefined ? logoUrl : logo.logo;
        logo.type = type || logo.type;
        logo.location = location !== undefined ? location : logo.location;
        logo.students = students !== undefined ? students : logo.students;
        logo.programs = programs !== undefined ? programs : logo.programs;
        logo.order = order !== undefined ? order : logo.order;
        logo.isActive = isActive !== undefined ? isActive : logo.isActive;

        const updatedLogo = await logo.save();
        res.json(updatedLogo);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Delete partner logo
// @route   DELETE /api/admin/partner-logos/:id
// @access  Private (Admin)
async function deletePartnerLogo(req, res) {
    try {
        const logo = await PartnerLogo.findById(req.params.id);

        if (!logo) {
            return res.status(404).json({ message: 'Partner logo not found' });
        }

        await logo.deleteOne();
        res.json({ message: 'Partner logo removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Director Management

// @desc    Get all directors
// @route   GET /api/admin/directors
// @access  Private (Admin)
async function getDirectors(req, res) {
    try {
        const directors = await Director.find().sort({ order: 1, createdAt: 1 });
        res.json(directors);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Create director
// @route   POST /api/admin/directors
// @access  Private (Admin)
async function createDirector(req, res) {
    try {
        const { name, title, image, order } = req.body;

        const director = await Director.create({
            name,
            title,
            image,
            order: order || 0,
            isActive: true
        });

        res.status(201).json(director);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Update director
// @route   PUT /api/admin/directors/:id
// @access  Private (Admin)
async function updateDirector(req, res) {
    try {
        const { name, title, image, order, isActive } = req.body;

        const director = await Director.findById(req.params.id);

        if (!director) {
            return res.status(404).json({ message: 'Director not found' });
        }

        director.name = name || director.name;
        director.title = title || director.title;
        director.image = image || director.image;
        director.order = order !== undefined ? order : director.order;
        director.isActive = isActive !== undefined ? isActive : director.isActive;

        const updatedDirector = await director.save();
        res.json(updatedDirector);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Delete director
// @route   DELETE /api/admin/directors/:id
// @access  Private (Admin)
async function deleteDirector(req, res) {
    try {
        const director = await Director.findById(req.params.id);

        if (!director) {
            return res.status(404).json({ message: 'Director not found' });
        }

        await director.deleteOne();
        res.json({ message: 'Director removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Invite new user & send email
// @route   POST /api/admin/users/invite
// @access  Private (Admin)
async function inviteUser(req, res) {
    try {
        const { name, email, password, role, universityId } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        // Check if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'A user with this email already exists' });
        }

        // Create the user
        const user = await User.create({
            name,
            email,
            password,
            role,
            universityId: universityId || undefined,
            isVerified: true
        });

        // Send invitation email
        try {
            await sendEmail({
                email: user.email,
                subject: 'Security Protocol: Shared Neural Sync - SkillDad',
                message: `Hello ${user.name},\n\nYou have been invited to SkillDad as a ${user.role}.`,
                html: emailTemplates.invitation(user.name, user.role, user.email, password)
            });
        } catch (emailError) {
            console.error('Failed to send invitation email:', emailError);
            // We tell the admin the user was created but email failed
            return res.status(201).json({
                message: 'User created successfully, but invitation email failed to send. Please provide credentials manually.',
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });
        }

        res.status(201).json({
            message: 'User invited and email sent successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Invite user error:', error);
        res.status(500).json({ message: error.message || 'Server error inviting user' });
    }
}

// @desc    Get all universities
// @route   GET /api/admin/universities
// @access  Private (Admin)
async function getUniversities(req, res) {
    try {
        const universities = await User.find({ role: 'university' }).select('name profile');
        res.json(universities);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
    updateEntity,
    getGlobalStats,
    getAllUsers,
    updateUserRole,
    verifyUser,
    getPlatformAnalytics,
    getPartnerDetails,
    grantPermission,
    revokePermission,
    getAllStudents,
    getStudentDocuments,
    getStudentEnrollments,
    updateStudent,
    deleteStudent,
    getPartnerLogos,
    createPartnerLogo,
    updatePartnerLogo,
    deletePartnerLogo,
    getDirectors,
    createDirector,
    updateDirector,
    deleteDirector,
    inviteUser,
    getUniversities
};
