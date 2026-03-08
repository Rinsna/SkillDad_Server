const { query } = require('../config/postgres');
const sendEmail = require('../utils/sendEmail');
const emailTemplates = require('../utils/emailTemplates');
const socketService = require('../services/SocketService');
const bcrypt = require('bcryptjs');

// @desc    Update entity (partner/university) details + discount rate
// @route   PUT /api/admin/entities/:id
// @access  Private (Admin)
// @desc    Update entity (partner/university) details + discount rate
// @route   PUT /api/admin/entities/:id
// @access  Private (Admin)
const updateEntity = async (req, res) => {
    try {
        console.log('[updateEntity] body:', req.body, 'id:', req.params.id);
        const { name, email, role, discountRate } = req.body;

        const userRes = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        const user = userRes.rows[0];
        if (!user) {
            return res.status(404).json({ message: 'Entity not found' });
        }

        let updateFields = [];
        let params = [];
        let paramCount = 1;

        if (name && name.trim()) {
            const trimmedName = name.trim();
            updateFields.push(`name = $${paramCount++}`);
            params.push(trimmedName);

            // Sync profile
            let profile = user.profile || {};
            if (user.role === 'partner') profile.partnerName = trimmedName;
            else if (user.role === 'university') profile.universityName = trimmedName;

            updateFields.push(`profile = $${paramCount++}`);
            params.push(JSON.stringify(profile));
        }

        if (email && email.trim()) {
            updateFields.push(`email = $${paramCount++}`);
            params.push(email.trim().toLowerCase());
        }

        if (role) {
            const validRoles = ['student', 'university', 'partner', 'admin', 'finance'];
            const lowerRole = role.toLowerCase();
            if (!validRoles.includes(lowerRole)) {
                return res.status(400).json({ message: `Invalid role: ${role}` });
            }
            updateFields.push(`role = $${paramCount++}`);
            params.push(lowerRole);
        }

        if (discountRate !== undefined && discountRate !== null) {
            updateFields.push(`"discountRate" = $${paramCount++}`);
            params.push(Number(discountRate) || 0);
        }

        if (updateFields.length > 0) {
            params.push(req.params.id);
            const updateQuery = `UPDATE users SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;
            const updatedRes = await query(updateQuery, params);
            const saved = updatedRes.rows[0];

            // Notify admins via WebSocket
            socketService.notifyUserListUpdate('updated', saved);

            // Handle Discount Code for Partners
            if (saved.role === 'partner' && discountRate !== undefined && discountRate !== null) {
                const newCode = (saved.name.replace(/\s+/g, '').substring(0, 6) + (Number(discountRate) || 0)).toUpperCase();

                const discRes = await query('SELECT id FROM discounts WHERE partner_id = $1', [saved.id]);
                if (discRes.rowCount > 0) {
                    await query(
                        'UPDATE discounts SET value = $1, code = $2, updated_at = NOW() WHERE partner_id = $3',
                        [Number(discountRate) || 0, newCode, saved.id]
                    );
                } else {
                    await query(
                        'INSERT INTO discounts (code, value, type, partner_id, active, uses, max_uses) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                        [newCode, Number(discountRate) || 0, 'percentage', saved.id, true, 0, 9999]
                    );
                }
            }

            return res.json({
                _id: saved.id,
                name: saved.name,
                email: saved.email,
                role: saved.role,
                discountRate: saved.discountRate,
                isVerified: saved.is_verified,
                message: 'Entity updated successfully'
            });
        }

        return res.json({ message: 'No changes provided' });
    } catch (error) {
        console.error('[updateEntity] error:', error);
        if (error.code === '23505') { // Postgres unique violation
            return res.status(400).json({ message: 'Email already in use by another account' });
        }
        return res.status(500).json({ message: error.message || 'Server error updating entity' });
    }
};

// @desc    Get Global Stats (Admin)
const getGlobalStats = async (req, res) => {
    try {
        const [userCount, courseCount, studentCount, partnerCount, ticketCount] = await Promise.all([
            query('SELECT COUNT(*) FROM users'),
            query('SELECT COUNT(*) FROM courses'),
            query("SELECT COUNT(*) FROM users WHERE role = 'student'"),
            query("SELECT COUNT(*) FROM users WHERE role = 'partner'"),
            query("SELECT COUNT(*) FROM audit_logs WHERE action = 'error'") // Placeholder for support tickets
        ]);

        res.json({
            totalUsers: parseInt(userCount.rows[0].count),
            totalCourses: parseInt(courseCount.rows[0].count),
            totalStudents: parseInt(studentCount.rows[0].count),
            totalPartners: parseInt(partnerCount.rows[0].count),
            totalTickets: parseInt(ticketCount.rows[0].count),
            totalRevenue: 12500
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all users with pagination
const getAllUsers = async (req, res) => {
    const pageSize = 20;
    const page = Number(req.query.pageNumber) || 1;
    const offset = pageSize * (page - 1);

    try {
        const countRes = await query('SELECT COUNT(*) FROM users');
        const count = parseInt(countRes.rows[0].count);

        const usersRes = await query('SELECT id as _id, name, email, role, profile, is_verified, created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2', [pageSize, offset]);

        res.json({ users: usersRes.rows, page, pages: Math.ceil(count / pageSize) });
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

        const userRes = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        const user = userRes.rows[0];
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Role is optional — keep existing if not provided in request body
        const newRole = (role || user.role).toLowerCase();
        const validRoles = ['student', 'university', 'partner', 'admin', 'finance'];
        if (!validRoles.includes(newRole)) {
            return res.status(400).json({ message: 'Invalid role specified' });
        }

        let updateFields = [`role = $1`];
        let params = [newRole];
        let paramCount = 2;

        if (name) {
            updateFields.push(`name = $${paramCount++}`);
            params.push(name);

            let profile = user.profile || {};
            if (newRole === 'partner') profile.partnerName = name;
            else if (newRole === 'university') profile.universityName = name;

            updateFields.push(`profile = $${paramCount++}`);
            params.push(JSON.stringify(profile));
        }

        if (email) {
            updateFields.push(`email = $${paramCount++}`);
            params.push(email);
        }

        if (discountRate !== undefined) {
            updateFields.push(`"discountRate" = $${paramCount++}`);
            params.push(Number(discountRate));
        }

        params.push(req.params.id);
        const updateQuery = `UPDATE users SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;
        const updatedRes = await query(updateQuery, params);
        const updatedUser = updatedRes.rows[0];

        // Notify admins via WebSocket
        socketService.notifyUserListUpdate('updated', updatedUser);

        res.json({
            _id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            discountRate: updatedUser.discountRate,
            message: 'Partner details updated successfully'
        });
    } catch (error) {
        console.error('Update partner error:', error);
        res.status(500).json({
            message: error.code === '23505' ? 'Email already in use' : (error.message || 'Failed to update partner')
        });
    }
};



// @desc    Toggle user verification
// @route   PUT /api/admin/users/:id/verify
// @access  Private (Admin)
const verifyUser = async (req, res) => {
    try {
        const userRes = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        const user = userRes.rows[0];

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const newVerified = !user.is_verified;
        const updatedRes = await query('UPDATE users SET is_verified = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [newVerified, req.params.id]);
        const updatedUser = updatedRes.rows[0];

        // Notify admins via WebSocket
        socketService.notifyUserListUpdate('updated', updatedUser);

        res.json({
            _id: updatedUser.id,
            isVerified: updatedUser.is_verified,
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
        let userFilter = "";
        let params = [];

        if (startDate && endDate) {
            userFilter = "WHERE created_at >= $1 AND created_at <= $2";
            params = [new Date(startDate), new Date(endDate)];
        }

        const statsRes = await query(`
            SELECT role as _id, COUNT(*) as count 
            FROM users 
            ${userFilter} 
            GROUP BY role
        `, params);

        const userStats = statsRes.rows.map(row => ({
            _id: row._id,
            count: parseInt(row.count)
        }));

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
        const partnerRes = await query('SELECT id as _id, name, email, role, profile, "discountRate", is_verified as "isVerified", created_at as "createdAt" FROM users WHERE id = $1', [req.params.id]);
        const partner = partnerRes.rows[0];

        if (partner) {
            const discounts = await query('SELECT code FROM discounts WHERE partner_id = $1', [partner._id]);
            const codes = discounts.rows.map(d => d.code);

            const studentsCountRes = await query(
                "SELECT COUNT(*) FROM users WHERE profile->>'partnerCode' = ANY($1) AND role = 'student'",
                [codes]
            );

            const payoutsRes = await query('SELECT amount, status FROM payouts WHERE partner_id = $1', [partner._id]);
            const payouts = payoutsRes.rows;

            const pendingPayouts = payouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
            const approvedPayouts = payouts.filter(p => p.status === 'approved').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

            res.json({
                ...partner,
                stats: {
                    totalCodes: codes.length,
                    studentsCount: parseInt(studentsCountRes.rows[0].count),
                    pendingPayouts,
                    totalEarnings: approvedPayouts
                }
            });
        } else {
            res.status(404).json({ message: 'Partner not found' });
        }
    } catch (error) {
        console.error('[getPartnerDetails] error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single user by ID
// @route   GET /api/admin/users/:id
// @access  Private (Admin)
const getUserById = async (req, res) => {
    try {
        const userRes = await query('SELECT id as _id, name, email, role, profile, "discountRate", is_verified as "isVerified", created_at as "createdAt" FROM users WHERE id = $1', [req.params.id]);
        if (userRes.rowCount > 0) {
            res.json(userRes.rows[0]);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get partner's discount codes
// @route   GET /api/admin/partners/:id/discounts
// @access  Private (Admin)
const getPartnerDiscounts = async (req, res) => {
    try {
        const discounts = await query('SELECT * FROM discounts WHERE partner_id = $1', [req.params.id]);
        res.json(discounts.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Grant permission (verify + change role)
// @route   PUT /api/admin/users/:id/grant-permission
// @access  Private (Admin)
const grantPermission = async (req, res) => {
    try {
        const { role } = req.query; // Check both body and query for role (some clients use body, some use params/query)
        const roleToGrant = role || req.body.role;

        if (!roleToGrant) {
            return res.status(400).json({ message: 'Role is required' });
        }

        const validRoles = ['student', 'university', 'partner', 'admin', 'finance'];
        if (!validRoles.includes(roleToGrant)) {
            return res.status(400).json({ message: 'Invalid role specified' });
        }

        const userRes = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (userRes.rowCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const updatedRes = await query(
            'UPDATE users SET is_verified = true, role = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [roleToGrant, req.params.id]
        );
        const updatedUser = updatedRes.rows[0];

        res.json({
            _id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            isVerified: updatedUser.is_verified,
            message: `Successfully granted ${roleToGrant} permission`
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
        const userRes = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (userRes.rowCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const updatedRes = await query(
            "UPDATE users SET is_verified = false, role = 'student', updated_at = NOW() WHERE id = $1 RETURNING *",
            [req.params.id]
        );
        const updatedUser = updatedRes.rows[0];

        res.json({
            _id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            isVerified: updatedUser.is_verified,
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
        const { courseId, universityId } = req.query;

        let studentFilter = "role = 'student'";
        let params = [];
        let paramCount = 1;

        if (courseId && courseId !== 'all') {
            studentFilter += ` AND id IN (SELECT student_id FROM enrollments WHERE course_id = $${paramCount++})`;
            params.push(courseId);
        }

        if (universityId && universityId !== 'all') {
            studentFilter += ` AND "universityId" = $${paramCount++}`;
            params.push(universityId);
        }

        const studentsRes = await query(`
            SELECT 
                s.id as _id, s.name, s.email, s.profile, s.created_at, s."universityId", s.registered_by,
                u.name as "universityName",
                r.name as "registeredByName"
            FROM users s
            LEFT JOIN users u ON s."universityId" = u.id
            LEFT JOIN users r ON s.registered_by = r.id
            WHERE ${studentFilter}
            ORDER BY s.created_at DESC
        `, params);

        const students = studentsRes.rows;

        const studentsWithEnrollments = await Promise.all(
            students.map(async (student) => {
                const enrollmentsRes = await query(`
                    SELECT e.id, c.title as "courseTitle"
                    FROM enrollments e
                    JOIN courses c ON e.course_id = c.id
                    WHERE e.student_id = $1
                    ORDER BY e.created_at DESC
                `, [student._id]);

                const enrollments = enrollmentsRes.rows;

                return {
                    ...student,
                    enrollmentCount: enrollments.length,
                    course: enrollments.length > 0 ? enrollments[0].courseTitle : 'No Enrollment'
                };
            })
        );

        res.json(studentsWithEnrollments);
    } catch (error) {
        console.error('[getAllStudents] error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get student documents
// @route   GET /api/admin/students/:id/documents
// @access  Private (Admin)
const getStudentDocuments = async (req, res) => {
    try {
        const documents = await query('SELECT * FROM documents WHERE student_id = $1', [req.params.id]);
        res.json(documents.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get student enrollments
// @route   GET /api/admin/students/:id/enrollments
// @access  Private (Admin)
const getStudentEnrollments = async (req, res) => {
    try {
        const enrollmentsRes = await query(`
            SELECT 
                e.*, 
                c.title as "title", c.thumbnail as "thumbnail", c.category as "category",
                i.name as "instructorName", i.profile as "instructorProfile"
            FROM enrollments e
            JOIN courses c ON e.course_id = c.id
            LEFT JOIN users i ON c.instructor_id = i.id
            WHERE e.student_id = $1
        `, [req.params.id]);

        // Transform to match frontend expected format (nested course object)
        const enrollments = enrollmentsRes.rows.map(row => ({
            ...row,
            course: {
                title: row.title,
                thumbnail: row.thumbnail,
                category: row.category,
                instructor: {
                    name: row.instructorName,
                    profile: row.instructorProfile
                }
            }
        }));

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
        const studentRes = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        const student = studentRes.rows[0];

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        if (student.role !== 'student') {
            return res.status(400).json({ message: 'User is not a student' });
        }

        const name = req.body.name || student.name;
        const email = req.body.email || student.email;
        const bio = req.body.bio || student.bio;
        const isVerified = req.body.isVerified !== undefined ? req.body.isVerified : student.is_verified;

        const updatedRes = await query(`
            UPDATE users SET 
                name = $1, email = $2, bio = $3, is_verified = $4, updated_at = NOW() 
            WHERE id = $5 
            RETURNING *
        `, [name, email.toLowerCase(), bio, isVerified, req.params.id]);

        const updatedStudent = updatedRes.rows[0];

        res.json({
            _id: updatedStudent.id,
            name: updatedStudent.name,
            email: updatedStudent.email,
            bio: updatedStudent.bio,
            role: updatedStudent.role,
            isVerified: updatedStudent.is_verified
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
        const studentRes = await query('SELECT role FROM users WHERE id = $1', [req.params.id]);
        const student = studentRes.rows[0];

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        if (student.role !== 'student') {
            return res.status(400).json({ message: 'User is not a student' });
        }

        await query('DELETE FROM users WHERE id = $1', [req.params.id]);

        res.json({ message: 'Student deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete any user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin)
const deleteUser = async (req, res) => {
    try {
        const userRes = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        const user = userRes.rows[0];

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent deleting yourself
        if (user.id === req.user.id) {
            return res.status(400).json({ message: 'You cannot delete your own account' });
        }

        await query('DELETE FROM users WHERE id = $1', [req.params.id]);

        // Notify via WebSocket
        socketService.notifyUserListUpdate('deleted', user);

        res.json({ message: 'User deleted successfully', user: { _id: user.id, name: user.name, email: user.email } });
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
        const logos = await query('SELECT id as _id, name, logo, type, location, students, programs, "order", is_active as "isActive", created_at as "createdAt" FROM partner_logos ORDER BY "order" ASC, created_at ASC');
        res.json(logos.rows);
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

        const result = await query(
            'INSERT INTO partner_logos (name, logo, type, location, students, programs, "order", is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id as _id, name, logo, type, location, students, programs, "order", is_active as "isActive"',
            [name, logoUrl, type || 'corporate', location, students, programs, order || 0, true]
        );

        res.status(201).json(result.rows[0]);
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

        const result = await query(
            'UPDATE partner_logos SET name = COALESCE($1, name), logo = COALESCE($2, logo), type = COALESCE($3, type), location = COALESCE($4, location), students = COALESCE($5, students), programs = COALESCE($6, programs), "order" = COALESCE($7, "order"), is_active = COALESCE($8, is_active), updated_at = NOW() WHERE id = $9 RETURNING id as _id, name, logo, type, location, students, programs, "order", is_active as "isActive"',
            [name, logoUrl, type, location, students, programs, order, isActive, req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Partner logo not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Delete partner logo
// @route   DELETE /api/admin/partner-logos/:id
// @access  Private (Admin)
async function deletePartnerLogo(req, res) {
    try {
        const result = await query('DELETE FROM partner_logos WHERE id = $1', [req.params.id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Partner logo not found' });
        }

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
        const directors = await query('SELECT id as _id, name, title, image, "order", is_active as "isActive", created_at as "createdAt" FROM directors ORDER BY "order" ASC, created_at ASC');
        res.json(directors.rows);
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

        const result = await query(
            'INSERT INTO directors (name, title, image, "order", is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id as _id, name, title, image, "order", is_active as "isActive"',
            [name, title, image, order || 0, true]
        );

        res.status(201).json(result.rows[0]);
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

        const result = await query(
            'UPDATE directors SET name = COALESCE($1, name), title = COALESCE($2, title), image = COALESCE($3, image), "order" = COALESCE($4, "order"), is_active = COALESCE($5, is_active), updated_at = NOW() WHERE id = $6 RETURNING id as _id, name, title, image, "order", is_active as "isActive"',
            [name, title, image, order, isActive, req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Director not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Delete director
// @route   DELETE /api/admin/directors/:id
// @access  Private (Admin)
async function deleteDirector(req, res) {
    try {
        const result = await query('DELETE FROM directors WHERE id = $1', [req.params.id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Director not found' });
        }

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
        const normalizedEmail = email ? email.toLowerCase().trim() : '';

        // Check if user exists in PG
        const exists = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 8);
        const newId = `user_${Date.now()}`;

        await query(`
            INSERT INTO users (id, name, email, password, role, "universityId", is_verified, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
        `, [newId, name, normalizedEmail, hashedPassword, role, universityId || null]);

        // Email notification
        try {
            await sendEmail({
                email: normalizedEmail,
                subject: 'Account Created - SkillDad',
                html: emailTemplates.invitation(name, role, normalizedEmail, password)
            });
        } catch (err) {
            console.error('Invite email failed:', err.message);
        }

        res.status(201).json({ success: true, message: 'User invited successfully' });
    } catch (error) {
        console.error('Invite user error:', error);
        res.status(500).json({ message: error.message });
    }
}

// @desc    Get all universities
async function getUniversities(req, res) {
    try {
        const resSet = await query("SELECT id as _id, name, profile FROM users WHERE role = 'university'");
        res.json(resSet.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Assign courses to a university
// @route   PUT /api/admin/universities/:id/courses
// @access  Private (Admin)
async function assignCoursesToUniversity(req, res) {
    try {
        const { courses } = req.body; // Expecting an array of course IDs
        const userRes = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        const university = userRes.rows[0];

        if (!university) {
            return res.status(404).json({ message: 'University not found' });
        }

        if (university.role !== 'university') {
            return res.status(400).json({ message: 'Target entity is not a university' });
        }

        let profile = university.profile || {};
        if (Array.isArray(courses)) {
            profile.assignedCourses = courses;
        }

        const updatedRes = await query(
            'UPDATE users SET profile = $1, updated_at = NOW() WHERE id = $2 RETURNING id as _id, name, profile',
            [JSON.stringify(profile), req.params.id]
        );
        const updatedUniversity = updatedRes.rows[0];

        res.json({
            _id: updatedUniversity._id,
            name: updatedUniversity.name,
            assignedCourses: updatedUniversity.profile.assignedCourses,
            message: 'Courses assigned successfully'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Get university details (including students and assigned courses)
// @route   GET /api/admin/universities/:id
// @access  Private (Admin)
async function getUniversityDetail(req, res) {
    try {
        const uniRes = await query('SELECT id as _id, name, email, role, profile, created_at FROM users WHERE id = $1', [req.params.id]);
        const university = uniRes.rows[0];

        if (!university || university.role !== 'university') {
            return res.status(404).json({ message: 'University not found' });
        }

        // Fetch courses where this university is the instructor (Provider University)
        const providedRes = await query('SELECT id FROM courses WHERE instructor_id = $1', [university._id]);
        const providedIds = providedRes.rows.map(p => p.id);

        // Manual assigned IDs from profile
        const assignedIds = university.profile?.assignedCourses || [];

        // Combine unique IDs
        const finalIds = Array.from(new Set([...providedIds, ...assignedIds]));

        // Fetch full course data for all identified IDs
        let uniqueCourses = [];
        if (finalIds.length > 0) {
            const coursesRes = await query('SELECT * FROM courses WHERE id = ANY($1)', [finalIds]);
            uniqueCourses = coursesRes.rows;
        }

        const rawStudentsRes = await query('SELECT id as _id, name, email, is_verified as "isVerified", created_at as "createdAt" FROM users WHERE "universityId" = $1 AND role = \'student\'', [university._id]);
        const rawStudents = rawStudentsRes.rows;

        const students = await Promise.all(rawStudents.map(async (student) => {
            const latestRes = await query(`
                SELECT e.id, c.title 
                FROM enrollments e 
                JOIN courses c ON e.course_id = c.id 
                WHERE e.student_id = $1 
                ORDER BY e.created_at DESC 
                LIMIT 1
            `, [student._id]);

            const latestEnrollment = latestRes.rows[0];
            return {
                ...student,
                course: latestEnrollment ? latestEnrollment.title : 'Enrolled'
            };
        }));

        res.json({
            university: {
                ...university,
                assignedCourses: uniqueCourses
            },
            students
        });
    } catch (error) {
        console.error('[getUniversityDetail] error:', error);
        res.status(500).json({ message: error.message });
    }
}

// @desc    Admin enrolls a student in a course for free (no payment required)
// @route   POST /api/admin/students/:id/enroll
// @access  Private (Admin)
const adminEnrollStudent = async (req, res) => {
    try {
        const { courseId, universityId, note } = req.body;
        const studentId = req.params.id;

        if (!courseId) {
            return res.status(400).json({ message: 'Course ID is required' });
        }

        const studentRes = await query('SELECT * FROM users WHERE id = $1', [studentId]);
        const student = studentRes.rows[0];
        if (!student || student.role !== 'student') {
            return res.status(404).json({ message: 'Student not found' });
        }

        const courseRes = await query('SELECT * FROM courses WHERE id = $1', [courseId]);
        const course = courseRes.rows[0];
        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        // Check if already enrolled
        const existingEnrollment = await query('SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2', [studentId, courseId]);
        if (existingEnrollment.rowCount > 0) {
            return res.status(400).json({ message: `${student.name} is already enrolled in ${course.title}` });
        }

        // Determine and update student's universityId
        let assignedUniversityId = universityId;

        if (universityId) {
            const uniRes = await query('SELECT id, role FROM users WHERE id = $1', [universityId]);
            const university = uniRes.rows[0];
            if (!university || university.role !== 'university') {
                return res.status(400).json({ message: 'Invalid university ID' });
            }
            assignedUniversityId = universityId;
        } else if (course.instructor_id) {
            const instRes = await query('SELECT id, role FROM users WHERE id = $1', [course.instructor_id]);
            const instructor = instRes.rows[0];
            if (instructor && instructor.role === 'university') {
                assignedUniversityId = instructor.id;
            }
        }

        // Update student's universityId if we have one
        if (assignedUniversityId && (!student.universityId || student.universityId !== assignedUniversityId)) {
            await query('UPDATE users SET "universityId" = $1, updated_at = NOW() WHERE id = $2', [assignedUniversityId, studentId]);
            console.log(`[adminEnrollStudent] Updated student ${student.name} universityId to ${assignedUniversityId}`);
        }

        // Create enrollment
        const enrollmentId = `enr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const enrollRes = await query(
            'INSERT INTO enrollments (id, student_id, course_id, status, progress, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *',
            [enrollmentId, studentId, courseId, 'active', 0]
        );
        const enrollment = enrollRes.rows[0];

        // Create Progress record
        try {
            const existingProgress = await query('SELECT id FROM progress_records WHERE user_id = $1 AND course_id = $2', [studentId, courseId]);
            if (existingProgress.rowCount === 0) {
                await query(
                    'INSERT INTO progress_records (user_id, course_id, completed_videos, completed_exercises, project_submissions, is_completed, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
                    [studentId, courseId, '[]', '[]', '[]', false]
                );
                console.log(`[adminEnrollStudent] Created progress_records for student ${student.name} in course ${course.title}`);
            }
        } catch (progressError) {
            console.error('[adminEnrollStudent] Error creating progress record:', progressError.message);
        }

        // Create a free Payment record
        const txnId = `ADM-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        // Determine partner/center
        let partnerId = null;
        let centerName = 'Admin Enrolled';

        if (universityId) {
            partnerId = universityId;
            const uniUserRes = await query('SELECT name, profile FROM users WHERE id = $1', [universityId]);
            const uniUser = uniUserRes.rows[0];
            if (uniUser) {
                centerName = uniUser.profile?.universityName || uniUser.name;
            }
        } else if (student.registered_by) {
            partnerId = student.registered_by;
            const partnerUserRes = await query('SELECT name, profile FROM users WHERE id = $1', [partnerId]);
            const partnerUser = partnerUserRes.rows[0];
            if (partnerUser) {
                centerName = partnerUser.profile?.partnerName || partnerUser.profile?.universityName || partnerUser.name;
            }
        } else if (student.universityId) {
            partnerId = student.universityId;
            const uniUserRes = await query('SELECT name, profile FROM users WHERE id = $1', [partnerId]);
            const uniUser = uniUserRes.rows[0];
            if (uniUser) {
                centerName = uniUser.profile?.universityName || uniUser.name;
            }
        }

        const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        await query(`
            INSERT INTO payments 
            (id, student_id, course_id, amount, payment_method, transaction_id, status, partner_id, center, notes, reviewed_by, reviewed_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW())
        `, [
            paymentId, studentId, courseId, 0, 'admin_enrolled', txnId, 'approved',
            partnerId, centerName, note || `Admin free enrollment by ${req.user?.name || 'Admin'}`, req.user?.id
        ]);

        // Notify via socket
        try {
            socketService.emitToUser(studentId, 'ENROLLMENT_CREATED', {
                courseId,
                courseTitle: course.title,
                message: `You have been enrolled in ${course.title} by admin`
            });
        } catch (e) { }

        if (assignedUniversityId) {
            try {
                socketService.emitToUser(assignedUniversityId, 'STUDENT_ENROLLED', {
                    studentId: student.id,
                    studentName: student.name,
                    studentEmail: student.email,
                    courseId,
                    courseTitle: course.title,
                    enrollmentId: enrollment.id,
                    message: `${student.name} has been enrolled in ${course.title}`
                });
            } catch (e) { }
        }

        // Email & WhatsApp
        try {
            const enrolledBy = req.user?.name || 'Admin';
            if (student.email) {
                await sendEmail({
                    email: student.email,
                    subject: `Course Enrollment Confirmed - ${course.title}`,
                    html: emailTemplates.adminEnrollment(student.name, course.title, enrolledBy)
                }).catch(err => console.error('[adminEnrollStudent] Email error:', err.message));
            }
            // WhatsApp service omitted for brevity as it might not be fully migrated but keep call if it exists
        } catch (notifError) { }

        res.status(201).json({
            message: `${student.name} successfully enrolled in ${course.title}${universityId ? ' and assigned to university' : ''}`,
            enrollment: { ...enrollment, _id: enrollment.id },
            transactionId: txnId
        });
    } catch (error) {
        console.error('[adminEnrollStudent] error:', error);
        res.status(500).json({ message: error.message || 'Failed to enroll student' });
    }
};

// @desc    Admin removes student enrollment from a course
// @route   DELETE /api/admin/students/:id/enroll/:courseId
// @access  Private (Admin)
const adminUnenrollStudent = async (req, res) => {
    try {
        const { id: studentId, courseId } = req.params;

        const enrollRes = await query('DELETE FROM enrollments WHERE student_id = $1 AND course_id = $2 RETURNING *', [studentId, courseId]);

        if (enrollRes.rowCount === 0) {
            return res.status(404).json({ message: 'Enrollment not found' });
        }

        // Also soft-update the payment record for this admin enrollment
        await query(`
            UPDATE payments 
            SET status = 'rejected', notes = 'Unenrolled by admin', updated_at = NOW() 
            WHERE student_id = $1 AND course_id = $2 AND payment_method = 'admin_enrolled'
        `, [studentId, courseId]);

        res.json({ message: 'Student unenrolled successfully' });
    } catch (error) {
        console.error('[adminUnenrollStudent] error:', error);
        res.status(500).json({ message: error.message || 'Failed to unenroll student' });
    }
};

// @desc    Admin updates university profile image
// @route   POST /api/admin/universities/:id/upload-image
// @access  Private (Admin)
const uploadUniversityProfileImage = async (req, res) => {
    try {
        const userRes = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        const user = userRes.rows[0];

        if (!user || user.role !== 'university') {
            return res.status(404).json({ message: 'University not found' });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'Please upload an image' });
        }

        // Use the same path format as userController
        const imagePath = `/uploads/${req.file.filename}`;

        await query('UPDATE users SET profile_image = $1, updated_at = NOW() WHERE id = $2', [imagePath, req.params.id]);

        res.json({
            message: 'University profile image updated',
            profileImage: imagePath
        });
    } catch (error) {
        console.error('[uploadUniversityProfileImage] Error:', error);
        res.status(500).json({ message: error.message || 'Server error uploading image' });
    }
};

// @desc    Admin updates university profile data (bio, location, etc.)
// @route   PUT /api/admin/universities/:id/profile
// @access  Private (Admin)
const updateUniversityProfile = async (req, res) => {
    try {
        const { bio, location, website, phone } = req.body;
        const userRes = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        const user = userRes.rows[0];

        if (!user || user.role !== 'university') {
            return res.status(404).json({ message: 'University not found' });
        }

        // Initialize profile if it doesn't exist
        let profile = user.profile || {};
        profile.location = location !== undefined ? location : profile.location;
        profile.website = website !== undefined ? website : profile.website;
        profile.phone = phone !== undefined ? phone : profile.phone;

        const newBio = bio !== undefined ? bio : user.bio;

        const updatedRes = await query(
            'UPDATE users SET bio = $1, profile = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
            [newBio, JSON.stringify(profile), req.params.id]
        );
        const updatedUser = updatedRes.rows[0];

        res.json({
            message: 'University profile updated successfully',
            user: {
                _id: updatedUser.id,
                bio: updatedUser.bio,
                profile: updatedUser.profile
            }
        });
    } catch (error) {
        console.error('[updateUniversityProfile] Error:', error);
        res.status(500).json({ message: error.message || 'Server error updating profile' });
    }
};

module.exports = {
    updateEntity,
    getGlobalStats,
    getAllUsers,
    getUserById,
    updateUserRole,
    verifyUser,
    getPlatformAnalytics,
    getPartnerDetails,
    getPartnerDiscounts,
    grantPermission,
    revokePermission,
    getAllStudents,
    getStudentDocuments,
    getStudentEnrollments,
    updateStudent,
    deleteStudent,
    deleteUser,
    getPartnerLogos,
    createPartnerLogo,
    updatePartnerLogo,
    deletePartnerLogo,
    getDirectors,
    createDirector,
    updateDirector,
    deleteDirector,
    inviteUser,
    getUniversities,
    assignCoursesToUniversity,
    getUniversityDetail,
    adminEnrollStudent,
    adminUnenrollStudent,
    uploadUniversityProfileImage,
    updateUniversityProfile
};
