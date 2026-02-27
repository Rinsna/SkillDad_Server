const Course = require('../models/courseModel');
const User = require('../models/userModel');
const Progress = require('../models/progressModel');
const Enrollment = require('../models/enrollmentModel');
const sendEmail = require('../utils/sendEmail');
const emailTemplates = require('../utils/emailTemplates');
const whatsAppService = require('../services/WhatsAppService');
const certificateGenerator = require('../services/CertificateGeneratorService');
const path = require('path');

// @desc    Enroll in a course
// @route   POST /api/enrollment/:courseId
// @access  Private (Student)
const enrollInCourse = async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.id;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Check if already enrolled
    const existingProgress = await Progress.findOne({ user: userId, course: courseId });
    if (existingProgress) {
        res.status(400);
        throw new Error('Already enrolled in this course');
    }

    // Create initial progress record
    const progress = await Progress.create({
        user: userId,
        course: courseId,
        completedVideos: [],
        completedExercises: [],
        projectSubmissions: [],
    });

    // Also create formal Enrollment record
    await Enrollment.create({
        student: userId,
        course: courseId,
        status: 'active',
        progress: 0,
        completedModules: 0,
        totalModules: course.modules?.length || 0,
    });

    // Update student's universityId if the course is hosted by an instructor with role 'university'
    // This addresses Requirement: "it updates in that particular university students list where student joined course"
    if (course.instructor) {
        const student = await User.findById(userId);
        if (student) {
            const instructor = await User.findById(course.instructor);
            // Link if student doesn't have a university yet, or if they joined a university course
            if (instructor && instructor.role === 'university') {
                student.universityId = instructor._id;
                await student.save();
                console.log(`[Enrollment] Linked student ${student.email} to university ${instructor.name}`);
            }
        }
    }

    res.status(201).json(progress);
};

// @desc    Get enrolled courses for logged-in user
// @route   GET /api/enrollment/my-courses
// @access  Private
const getMyCourses = async (req, res) => {
    const enrollments = await Progress.find({ user: req.user.id })
        .populate({
            path: 'course',
            select: 'title thumbnail category instructor modules instructorName universityName',
            populate: { path: 'instructor', select: 'name profile role' }
        });

    const transformed = enrollments.map(e => {
        const courseObj = e.course ? e.course.toObject() : null;
        if (!courseObj) return e;

        // Calculate total videos across all modules
        const totalVideos = courseObj.modules?.reduce((sum, m) => sum + (m.videos?.length || 0), 0) || 0;
        const completedVideosCount = e.completedVideos?.length || 0;

        // Calculate progress percentage
        const progress = totalVideos > 0 ? Math.round((completedVideosCount / totalVideos) * 100) : 0;

        // Calculate module counts
        const totalModules = courseObj.modules?.length || 0;
        // Approximation of completed modules based on videos
        const completedModules = totalVideos > 0 ? Math.floor((completedVideosCount / totalVideos) * totalModules) : 0;

        return {
            ...e.toObject(),
            progress,
            totalVideos,
            completedVideosCount,
            totalModules,
            completedModules
        };
    });

    res.status(200).json(transformed);
};

// @desc    Update progress (video completion)
// @route   PUT /api/enrollment/progress
// @access  Private
const updateProgress = async (req, res) => {
    const { courseId, videoId, exerciseScore } = req.body;
    const userId = req.user.id;

    const progress = await Progress.findOne({ user: userId, course: courseId });

    if (!progress) {
        res.status(404);
        throw new Error('Enrollment not found');
    }

    // Add video to completed if not already there
    if (videoId && !progress.completedVideos.includes(videoId)) {
        progress.completedVideos.push(videoId);
    }

    // Add exercise score
    if (exerciseScore) {
        // Logic to update or add exercise score
        // For simplicity, we just push if new
        const exists = progress.completedExercises.find(e => e.video.toString() === videoId);
        if (!exists) {
            progress.completedExercises.push({ video: videoId, score: exerciseScore });
        }
    }

    await progress.save();

    // --- Course Completion Logic ---
    try {
        const course = await Course.findById(courseId);
        const totalVideos = course.modules?.reduce((sum, m) => sum + (m.videos?.length || 0), 0) || 0;
        const completedVideosCount = progress.completedVideos.length;
        const completionPercentage = totalVideos > 0 ? (completedVideosCount / totalVideos) * 100 : 0;

        if (completionPercentage >= 100 && !progress.isCompleted) {
            progress.isCompleted = true;
            await progress.save();

            // 1. Sync Enrollment Status
            let enrollment = await Enrollment.findOne({ student: userId, course: courseId });
            if (enrollment) {
                enrollment.status = 'completed';
                enrollment.progress = 100;
                await enrollment.save();
            } else {
                // Create enrollment if it doesn't exist (e.g., manual progress track)
                enrollment = await Enrollment.create({
                    student: userId,
                    course: courseId,
                    status: 'completed',
                    progress: 100
                });
            }

            // 2. Generate Certificate
            const certData = await certificateGenerator.generateCertificate(enrollment._id);

            // 3. Notify Student
            const student = await User.findById(userId).select('name email profile');

            // Email
            try {
                await sendEmail({
                    email: student.email,
                    subject: `Certificate of Completion: ${course.title}`,
                    html: emailTemplates.courseCompletion(student.name, course.title, certData.publicUrl),
                    attachments: [{
                        filename: `SkillDad-Certificate-${course.title}.pdf`,
                        path: certData.filepath
                    }]
                });
            } catch (err) { console.error('[Cert Notif] Email failed:', err.message); }

            // WhatsApp
            const phone = student.profile?.phone || student.phone;
            if (phone) {
                try {
                    await whatsAppService.notifyCourseCompletion(student.name, phone, course.title);
                } catch (err) { console.error('[Cert Notif] WhatsApp failed:', err.message); }
            }

            // Real-time notification
            socketService.sendToUser(
                userId,
                'notification',
                {
                    type: 'course_completed',
                    title: 'Congratulations!',
                    message: `You have completed "${course.title}". Your certificate is ready!`,
                    courseId: course._id,
                    certUrl: certData.publicUrl
                }
            );
        }
    } catch (err) {
        console.error('[Progress Update] Completion logic error:', err.message);
    }

    res.status(200).json(progress);
};

module.exports = {
    enrollInCourse,
    getMyCourses,
    updateProgress
};
