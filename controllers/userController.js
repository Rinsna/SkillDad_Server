const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/userModel');
const sendEmail = require('../utils/sendEmail');
const emailTemplates = require('../utils/emailTemplates');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Register new user
// @route   POST /api/users
// @access  Public
const registerUser = async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        console.log('Registration attempt:', { name, email, phone: phone ? 'provided' : 'missing' });

        // Basic field validation
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please provide your name, email, and password.' });
        }

        // Phone is mandatory for all public registrations (students)
        if (!phone || phone.trim() === '') {
            return res.status(400).json({ message: 'WhatsApp number is required.' });
        }

        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'An account with this email already exists. Please login.' });
        }

        // Public registration ONLY creates student accounts
        // Universities and B2B partners are created by admin only
        let userRole = 'student';
        let discountRate = 0;

        // Check if admin is creating the user
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const creator = await User.findById(decoded.id).select('role');
                if (creator && creator.role === 'admin') {
                    userRole = req.body.role || 'student';
                    discountRate = req.body.discountRate || 0;
                }
            } catch (e) {
                console.error("Token admin check failed:", e.message);
            }
        }

        console.log(`Creating user with role: ${userRole}...`);
        const user = await User.create({
            name,
            email,
            password,
            role: userRole,
            isVerified: true,
            discountRate: discountRate,
            profile: {
                phone: phone.trim()
            }
        });

        if (user) {
            console.log('User created successfully:', user._id);

            // Send response FIRST - then fire notification in background (non-blocking)
            res.status(201).json({
                _id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified,
                token: generateToken(user.id),
            });

            // Fire-and-forget welcome notification AFTER response is sent
            setImmediate(async () => {
                try {
                    const notificationService = require('../services/NotificationService');
                    await notificationService.send(
                        { name: user.name, email: user.email, phone: user.profile?.phone },
                        'welcome'
                    );
                } catch (emailError) {
                    console.error('Welcome notification failed (non-blocking):', emailError.message);
                }
            });
        } else {
            res.status(400).json({ message: 'Registration failed. Please try again.' });
        }
    } catch (error) {
        console.error('CRITICAL REGISTRATION ERROR:', error);
        res.status(400).json({ message: error.message || 'Server error during registration' });
    }
};

// @desc    Authenticate a user
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('Login attempt received:', { email });

        if (!email || !password) {
            console.log('Login failed: Missing email or password');
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        // Check for user email
        console.log('Searching for user...');
        const user = await User.findOne({ email });

        if (!user) {
            console.log('Login failed: User not found -', email);
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        console.log('User found, matching password...');
        const isMatch = await user.matchPassword(password);
        console.log('Password match result:', isMatch);

        if (isMatch) {
            console.log('Login successful for:', email);
            const token = generateToken(user._id);
            console.log('Token generated successfully');

            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified,
                token: token,
            });
        } else {
            console.log('Login failed: Incorrect password for -', email);
            res.status(400).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('CRITICAL LOGIN ERROR:', error);
        res.status(500).json({ message: 'Server error during login', details: error.message });
    }
};

// @desc    Get user data
// @route   GET /api/users/me
// @access  Private
const getMe = async (req, res) => {
    const { _id, name, email, role } = await User.findById(req.user.id);
    res.status(200).json({
        id: _id,
        name,
        email,
        role,
    });
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.name = req.body.name || user.name;
        user.email = req.body.email || user.email;
        user.bio = req.body.bio || user.bio;

        if (req.body.profile) {
            user.profile = {
                ...user.profile,
                ...req.body.profile
            };
        }

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            bio: updatedUser.bio,
            profile: updatedUser.profile,
            token: generateToken(updatedUser.id),
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Server error updating profile' });
    }
};

// @desc    Update user password
// @route   PUT /api/users/password
// @access  Private
const updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Please provide current and new password' });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if current password matches
        const isMatch = await user.matchPassword(currentPassword);

        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Update password error:', error);
        res.status(500).json({ message: 'Server error updating password' });
    }
};

// @desc    Upload profile image
// @route   POST /api/users/upload-profile-image
// @access  Private
const uploadProfileImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Store relative path with forward slashes for cross-platform compatibility
        const imagePath = req.file.path.replace(/\\/g, '/');
        user.profileImage = `/${imagePath}`;

        await user.save();

        res.json({
            message: 'Image uploaded successfully',
            profileImage: user.profileImage
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ message: 'Server error uploading image' });
    }
};

// @desc    Get users with optional filters
// @route   GET /api/users
// @access  Private
const getUsers = async (req, res) => {
    try {
        const { role, universityId } = req.query;
        let query = {};

        if (role) query.role = role;
        if (universityId) query.universityId = universityId;

        const users = await User.find(query).select('-password');

        // Populate additional enrollment info for students
        const usersWithData = await Promise.all(users.map(async (user) => {
            if (user.role === 'student') {
                const Enrollment = require('../models/enrollmentModel');
                const enrollments = await Enrollment.find({ student: user._id })
                    .populate('course', 'title')
                    .sort('-createdAt');

                return {
                    ...user.toObject(),
                    enrollmentCount: enrollments.length,
                    course: enrollments.length > 0 ? enrollments[0].course?.title : 'Enrolled Student'
                };
            }
            return user;
        }));

        res.json(usersWithData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Forgot password
// @route   POST /api/users/forgotpassword
// @access  Public
const forgotPassword = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });

        if (!user) {
            return res.status(404).json({ message: 'User not found with this email' });
        }

        // Get reset token
        const resetToken = user.getResetPasswordToken();

        await user.save({ validateBeforeSave: false });

        // Create reset url
        const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

        const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}`;

        try {
            await sendEmail({
                email: user.email,
                subject: 'Security Protocol: Password Reset - SkillDad',
                message,
                html: emailTemplates.passwordReset(user.name, resetUrl)
            });

            res.status(200).json({ message: 'Email sent successfully' });
        } catch (error) {
            console.error('Email could not be sent:', error);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;

            await user.save({ validateBeforeSave: false });

            return res.status(500).json({ message: 'Email could not be sent' });
        }
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Server error during forgot password' });
    }
};

// @desc    Reset password
// @route   PUT /api/users/resetpassword/:resettoken
// @access  Public
const resetPassword = async (req, res) => {
    try {
        // Get hashed token
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resettoken)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired token' });
        }

        // Set new password
        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;

        await user.save();

        res.status(200).json({
            message: 'Password reset successful',
            token: generateToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Server error during password reset' });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
    getUsers,
    updateProfile,
    updatePassword,
    uploadProfileImage,
    forgotPassword,
    resetPassword
};
