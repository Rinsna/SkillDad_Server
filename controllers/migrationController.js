/**
 * Migration Controller
 * Handles one-time data migration tasks
 */

const Enrollment = require('../models/enrollmentModel');
const Progress = require('../models/progressModel');

/**
 * @desc    Fix admin enrollments by creating missing Progress records
 * @route   POST /api/admin/migrations/fix-enrollments
 * @access  Private (Admin only)
 */
const fixAdminEnrollments = async (req, res) => {
    try {
        console.log('[Migration] Starting admin enrollment fix...');

        // Find all active enrollments
        const enrollments = await Enrollment.find({ status: 'active' })
            .populate('student', 'name email')
            .populate('course', 'title')
            .lean();

        console.log(`[Migration] Found ${enrollments.length} active enrollments`);

        let fixedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const fixedEnrollments = [];

        // Process each enrollment
        for (const enrollment of enrollments) {
            try {
                if (!enrollment.student || !enrollment.course) {
                    console.log(`[Migration] Skipping enrollment ${enrollment._id} - missing student or course`);
                    skippedCount++;
                    continue;
                }

                // Check if Progress record exists
                const existingProgress = await Progress.findOne({
                    user: enrollment.student._id,
                    course: enrollment.course._id
                });

                if (existingProgress) {
                    // Progress record already exists, skip
                    skippedCount++;
                    continue;
                }

                // Create missing Progress record
                await Progress.create({
                    user: enrollment.student._id,
                    course: enrollment.course._id,
                    completedVideos: [],
                    completedExercises: [],
                    projectSubmissions: [],
                    isCompleted: false
                });

                fixedCount++;
                fixedEnrollments.push({
                    studentName: enrollment.student.name,
                    studentEmail: enrollment.student.email,
                    courseTitle: enrollment.course.title
                });

                console.log(`[Migration] Fixed: ${enrollment.student.name} → ${enrollment.course.title}`);

            } catch (error) {
                errorCount++;
                console.error(`[Migration] Error processing enrollment ${enrollment._id}:`, error.message);
            }
        }

        // Return summary
        res.status(200).json({
            success: true,
            message: 'Admin enrollment fix completed',
            summary: {
                totalProcessed: enrollments.length,
                fixed: fixedCount,
                skipped: skippedCount,
                errors: errorCount
            },
            fixedEnrollments: fixedEnrollments
        });

    } catch (error) {
        console.error('[Migration] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Migration failed',
            error: error.message
        });
    }
};

module.exports = {
    fixAdminEnrollments
};
