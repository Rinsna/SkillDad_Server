const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../config/postgres');
const sendEmail = require('../utils/sendEmail');
const emailTemplates = require('../utils/emailTemplates');
const socketService = require('../services/SocketService');

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
        const { name, email, password, phone, role = 'student', discountRate = 0 } = req.body;
        const lowerEmail = email.toLowerCase().trim();

        // 1. Check if user exists
        const userExists = await query('SELECT id FROM users WHERE email = $1', [lowerEmail]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(password, 8);
        const newId = `user_${Date.now()}`;

        // 3. Insert into PG
        const newUser = await query(`
            INSERT INTO users (id, name, email, password, role, discount_rate, profile, is_verified, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
            RETURNING id, name, email, role
        `, [
            newId, name, lowerEmail, hashedPassword, role, discountRate,
            JSON.stringify({ phone: phone || '' })
        ]);

        const user = newUser.rows[0];

        res.status(201).json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user.id)
        });

        // Background notification
        setImmediate(async () => {
            try {
                const notificationService = require('../services/NotificationService');
                await notificationService.send({ name: user.name, email: user.email, phone }, 'welcome');
            } catch (err) {
                console.error('Welcome notification failed:', err.message);
            }
        });

    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Authenticate a user
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const lowerEmail = email.toLowerCase().trim();

        const userRes = await query('SELECT * FROM users WHERE email = $1', [lowerEmail]);
        const user = userRes.rows[0];

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        res.json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isVerified: user.is_verified,
            token: generateToken(user.id)
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get current user profile
const getMe = async (req, res) => {
    try {
        const userRes = await query('SELECT id, name, email, role, profile FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            profile: user.profile
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update user profile
const updateProfile = async (req, res) => {
    try {
        const { name, email, bio, profile } = req.body;
        const userId = req.user.id;

        const updated = await query(`
            UPDATE users 
            SET name = COALESCE($1, name), 
                email = COALESCE($2, email), 
                bio = COALESCE($3, bio), 
                profile = COALESCE($4, profile),
                updated_at = NOW()
            WHERE id = $5
            RETURNING id, name, email, role, bio, profile
        `, [name, email ? email.toLowerCase() : null, bio, profile ? JSON.stringify(profile) : null, userId]);

        const user = updated.rows[0];
        res.json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            bio: user.bio,
            profile: user.profile,
            token: generateToken(user.id)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all users (Admin)
const getUsers = async (req, res) => {
    try {
        const { role } = req.query;
        let usersRes;
        if (role) {
            usersRes = await query('SELECT id as _id, name, email, role, profile, created_at FROM users WHERE role = $1 ORDER BY created_at DESC', [role]);
        } else {
            usersRes = await query('SELECT id as _id, name, email, role, profile, created_at FROM users ORDER BY created_at DESC');
        }

        // Add enrollment counts for students
        const users = usersRes.rows;
        if (role === 'student' || !role) {
            const enrollmentsRes = await query('SELECT student_id, COUNT(*) as count FROM enrollments GROUP BY student_id');
            const enrollMap = {};
            enrollmentsRes.rows.forEach(r => enrollMap[r.student_id] = r.count);

            const enriched = users.map(u => ({
                ...u,
                enrollmentCount: enrollMap[u._id] || 0
            }));
            return res.json(enriched);
        }

        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
    getUsers,
    updateProfile,
    // Add other methods (forgotPassword, resetPassword) similarly
    forgotPassword: async (req, res) => res.status(501).json({ message: 'Not implemented' }),
    resetPassword: async (req, res) => res.status(501).json({ message: 'Not implemented' }),
    updatePassword: async (req, res) => res.status(501).json({ message: 'Not implemented' }),
    uploadProfileImage: async (req, res) => res.status(501).json({ message: 'Not implemented' })
};
