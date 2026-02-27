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
        const { name, email, password, role, phone } = req.body;
        console.log('Registration attempt:', { name, email, role, phone });

        if (!name || !email || !password) {
            console.log('Registration failed: Missing fields');
            return res.status(400).json({ message: 'Please add all fields' });
        }

        // Check if user exists
        const userExists = await User.findOne({ email });

        if (userExists) {
            console.log('Registration failed: User exists -', email);
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create user - automatically verified for all roles except admin
        const userRole = role || 'student';
        const autoVerifyRoles = ['student', 'partner', 'university', 'finance'];

        console.log('Creating user document...');
        const user = await User.create({
            name,
            email,
            password,
            role: userRole,
            isVerified: autoVerifyRoles.includes(userRole), // Auto-verify all except admin
            discountRate: Number(req.body.discountRate) || 0,
            profile: {
                phone: phone || ''
            }
        });

        if (user) {
            console.log('User created successfully:', user._id);
            // Trigger Industrial Notification Engine for Onboarding
            const notificationService = require('../services/NotificationService');
            try {
                console.log('Attempting to send welcome notification...');
                await notificationService.send(
                    {
                        name: user.name,
                        email: user.email,
                        phone: user.profile?.phone
                    },
                    'welcome'
                );
                console.log('Welcome notification process initiated');
            } catch (emailError) {
                console.error('Core Background Sync Failed (Welcome Notif):', emailError);
            }

            res.status(201).json({
                _id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified,
                token: generateToken(user.id),
            });
        } else {
            console.log('Registration failed: User creation returned null');
            res.status(400).json({ message: 'Invalid user data' });
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
        res.json(users);
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
