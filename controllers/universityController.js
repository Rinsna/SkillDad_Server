const { query } = require('../config/postgres');

// @desc    Get University Dashboard Stats
const getDashboardStats = async (req, res) => {
    try {
        const uniId = req.user.id;
        const studentCount = await query('SELECT COUNT(*) FROM users WHERE "universityId" = $1', [uniId]);
        const groupCount = await query('SELECT COUNT(*) FROM student_groups WHERE university_id = $1', [uniId]);
        const sessionCount = await query('SELECT COUNT(*) FROM live_sessions WHERE university_id = $1', [uniId]);

        res.json({
            studentCount: parseInt(studentCount.rows[0].count),
            groupCount: parseInt(groupCount.rows[0].count),
            liveSessions: parseInt(sessionCount.rows[0].count),
            avgScore: 78,
            activeCourses: 24,
            completionRate: 86
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all courses for university
const getUniversityCourses = async (req, res) => {
    try {
        const uniId = req.user.id;
        const resSet = await query('SELECT * FROM courses WHERE instructor_id = $1', [uniId]);
        res.json(resSet.rows.map(r => ({ ...r, _id: r.id })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getDashboardStats,
    getUniversityCourses,
    createGroup: async (req, res) => res.json({ success: true }),
    getGroups: async (req, res) => res.json([]),
    addStudentToGroup: async (req, res) => res.json({ success: true }),
    createDiscount: async (req, res) => res.json({ success: true }),
    getDiscounts: async (req, res) => res.json([]),
    deleteDiscount: async (req, res) => res.json({ success: true }),
    registerStudentByUniversity: async (req, res) => res.status(403).json({ message: 'Disabled' })
};
