const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const Exam = require('../models/examModel');
const ExamSubmission = require('../models/examSubmissionModel');
const Course = require('../models/courseModel');
const User = require('../models/userModel');
const Enrollment = require('../models/enrollmentModel');
const notificationService = require('../services/NotificationService');
const socketService = require('../services/SocketService');
const emailTemplates = require('../utils/emailTemplates');
const sendEmail = require('../utils/sendEmail');

// @desc    Get all exams (Admin sees all, University sees their own/assigned)
// @route   GET /api/exams
// @access  Private (Admin/University)
router.get('/', protect, async (req, res) => {
    try {
        const userRole = req.user.role?.toLowerCase();
        if (userRole !== 'admin' && userRole !== 'university') {
            return res.status(403).json({ message: 'Not authorized as admin or university' });
        }
        console.log(`[EXAM ACCESS] GET / hit by ${req.user.email} (${req.user.role})`);
        let query = {};

        if (req.user.role?.toLowerCase() === 'university') {
            // Find courses where this university is the instructor
            const courses = await Course.find({ instructor: req.user._id });
            const courseIds = courses.map(c => c._id);

            // University see exams where they are instructor OR it specifically targets them
            query = {
                $or: [
                    { course: { $in: courseIds } },
                    { targetUniversity: req.user._id },
                    { targetUniversity: null },
                    { targetUniversity: { $exists: false } }
                ]
            };
            console.log(`[EXAM ROUTE] University Filter:`, JSON.stringify(query));
        }

        const exams = await Exam.find(query)
            .populate('course', 'title')
            .populate('instructor', 'name email role profile')
            .populate('targetUniversity', 'name profile')
            .populate('linkedPaper')
            .sort({ scheduledDate: -1 });

        res.json(exams);
    } catch (error) {
        console.error(`[EXAM ROUTE] Error:`, error.message);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get all exams for a course
// @route   GET /api/exams/course/:courseId
// @access  Private
router.get('/course/:courseId', protect, async (req, res) => {
    try {
        const exams = await Exam.find({
            course: req.params.courseId,
            isPublished: true
        }).populate('instructor', 'name email');

        res.json(exams);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get student's exams
// @route   GET /api/exams/my-exams
// @access  Private (Student)
router.get('/my-exams', protect, async (req, res) => {
    try {
        // Get courses the student is enrolled in
        const enrollments = await Enrollment.find({
            student: req.user._id,
            status: 'active'
        }).populate('course');

        const courseIds = enrollments.map(e => e.course._id);

        const exams = await Exam.find({
            course: { $in: courseIds },
            isPublished: true
        }).populate('course', 'title')
            .populate('instructor', 'name')
            .populate('linkedPaper');

        // Get student's submissions for these exams
        const submissions = await ExamSubmission.find({
            exam: { $in: exams.map(e => e._id) },
            student: req.user._id
        });

        // Combine exam data with submission status and time-based availability
        const now = new Date();
        const examsWithStatus = exams.map(exam => {
            const submission = submissions.find(s => s.exam.toString() === exam._id.toString());
            const scheduledDate = new Date(exam.scheduledDate);
            const deadline = exam.deadline ? new Date(exam.deadline) : null;

            let status = 'scheduled';
            let attemptsUsed = submission ? submission.attemptNumber : 0;

            if (submission) {
                if (submission.status === 'submitted' || submission.status === 'graded') {
                    status = submission.passed ? 'completed' : 'failed';
                } else {
                    status = submission.status; // 'in-progress'
                }
            } else {
                // Time-based checks for students who haven't started
                if (now < scheduledDate) {
                    status = 'scheduled';
                } else if (deadline && now > deadline) {
                    status = 'failed'; // Deadline passed
                } else {
                    status = 'available';
                }
            }

            return {
                ...exam.toObject(),
                submission: submission || null,
                status: status,
                attemptsUsed: attemptsUsed
            };
        });

        res.json(examsWithStatus);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get exam by ID
// @route   GET /api/exams/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id)
            .populate('course', 'title')
            .populate('instructor', 'name email');

        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        res.json(exam);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Create new exam
// @route   POST /api/exams
// @access  Private (Instructor/Admin)
router.post('/', protect, authorize('admin', 'university'), async (req, res) => {
    try {
        const { targetUniversity, course, totalMarks, totalPoints, ...rest } = req.body;

        console.log('[EXAM CREATE] Incoming Body:', JSON.stringify(req.body));
        console.log('[EXAM CREATE] Extracted targetUniversity:', targetUniversity);

        // Validation: Universities can only schedule exams at times mandated by Admin
        if (req.user.role === 'university') {
            const adminUsers = await User.find({ role: 'admin' }).select('_id');
            const adminIds = adminUsers.map(u => u._id);
            const slotId = req.body.mandatedSlotId || req.body._mandatedSlotId;

            let matchingAdminSlot;

            if (slotId) {
                matchingAdminSlot = await Exam.findOne({
                    _id: slotId,
                    instructor: { $in: adminIds },
                    course: course,
                    $or: [
                        { targetUniversity: req.user._id },
                        { targetUniversity: null },
                        { targetUniversity: { $exists: false } }
                    ]
                });
            } else {
                const targetDate = new Date(req.body.scheduledDate);
                matchingAdminSlot = await Exam.findOne({
                    instructor: { $in: adminIds },
                    course: course,
                    scheduledDate: {
                        $gte: new Date(targetDate.getTime() - 120000),
                        $lte: new Date(targetDate.getTime() + 120000)
                    }
                });
            }

            if (!matchingAdminSlot) {
                console.warn('[EXAM CREATE] Validation failed for:', req.user.email);
                const allSlots = await Exam.find({ instructor: { $in: adminIds }, course: course });
                console.log(`[EXAM VALIDATION] Slots on course:`, allSlots.map(s => ({ id: s._id, date: s.scheduledDate.toISOString() })));
                return res.status(403).json({ message: 'Unauthorized: No matching Admin-mandated slot found.' });
            }
            console.log(`[EXAM VALIDATION] Match found! Admin Slot ID: ${matchingAdminSlot._id}`);
        }

        const examObj = {
            ...rest,
            course,
            instructor: req.user._id,
            totalPoints: Number(totalPoints || totalMarks || 100),
            passingScore: Number(req.body.passingScore || req.body.passingMarks || 70)
        };

        // Explicitly set targetUniversity if present
        if (targetUniversity && targetUniversity !== '') {
            examObj.targetUniversity = targetUniversity;
        } else {
            examObj.targetUniversity = null;
        }

        const exam = new Exam(examObj);

        // Calculate total points from questions if present
        if (exam.questions && exam.questions.length > 0) {
            exam.totalPoints = exam.questions.reduce((total, q) => total + q.points, 0);
        }

        let savedExam = await exam.save();
        console.log('[EXAM CREATE] Saved Success. targetUniversity in DB:', savedExam.targetUniversity);

        savedExam = await savedExam.populate([
            { path: 'course', select: 'title' },
            { path: 'targetUniversity', select: 'name profile' },
            { path: 'instructor', select: 'name email profile' }
        ]);

        // Background: Notify students and university
        setImmediate(async () => {
            try {
                const course = await Course.findById(exam.course).populate('instructor');

                // 1. Notify University (if admin created)
                if (req.user.role === 'admin' && course && course.instructor && course.instructor.role === 'university') {
                    await sendEmail({
                        email: course.instructor.email,
                        subject: 'New Exam Scheduled - SkillDad',
                        html: emailTemplates.examScheduled(
                            course.instructor.name,
                            exam.title,
                            course.title,
                            exam.scheduledDate
                        )
                    });
                }

                if (savedExam.isPublished) {
                    const enrollments = await Enrollment.find({ course: exam.course, status: 'active' }).populate('student', '_id name email profile phone');
                    const students = enrollments.map(e => e.student).filter(s => !!s);

                    for (const student of students) {

                        // Centralized Industrial Notification (Email + WhatsApp fallback)
                        notificationService.send(
                            {
                                _id: student._id,
                                name: student.name,
                                email: student.email,
                                phone: student.profile?.phone || student.phone
                            },
                            'exam',
                            {
                                examTitle: exam.title,
                                courseTitle: course.title,
                                scheduledDate: exam.scheduledDate
                            }
                        ).catch(err => console.error(`[Exam Notif] Engine Error:`, err.message));

                        // Real-time socket notification remains for instant UI feedback
                        socketService.sendToUser(
                            student._id,
                            'notification',
                            {
                                type: 'exam_scheduled',
                                title: 'New Exam Scheduled',
                                message: `A new exam "${exam.title}" has been scheduled for ${course.title}.`,
                                examId: exam._id
                            }
                        );
                    }

                }
            } catch (bgErr) {
                console.error('[Create Exam] Background notification error:', bgErr.message);
            }
        });

        res.status(201).json(savedExam);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Start exam (create submission)
// @route   POST /api/exams/:id/start
// @access  Private (Student)
router.post('/:id/start', protect, async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        // Check if student has attempts left
        const existingSubmissions = await ExamSubmission.find({
            exam: exam._id,
            student: req.user._id
        });

        if (existingSubmissions.length >= exam.maxAttempts) {
            return res.status(400).json({ message: 'Maximum attempts reached' });
        }

        // Check if there's an active submission
        const activeSubmission = existingSubmissions.find(s => s.status === 'in-progress');
        if (activeSubmission) {
            return res.json(activeSubmission);
        }

        const submission = new ExamSubmission({
            exam: exam._id,
            student: req.user._id,
            startTime: new Date(),
            attemptNumber: existingSubmissions.length + 1
        });

        const savedSubmission = await submission.save();
        res.status(201).json(savedSubmission);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Submit exam answers
// @route   PUT /api/exams/:id/submit
// @access  Private (Student)
router.put('/:id/submit', protect, async (req, res) => {
    try {
        const { answers } = req.body;

        const submission = await ExamSubmission.findOne({
            exam: req.params.id,
            student: req.user._id,
            status: 'in-progress'
        });

        if (!submission) {
            return res.status(404).json({ message: 'Active submission not found' });
        }

        const exam = await Exam.findById(req.params.id);

        // Calculate score
        let totalScore = 0;
        const gradedAnswers = answers.map(answer => {
            const question = exam.questions.id(answer.questionId);
            let isCorrect = false;
            let pointsEarned = 0;

            if (question.type === 'multiple-choice') {
                const correctOption = question.options.find(opt => opt.isCorrect);
                isCorrect = answer.answer === correctOption.text;
                pointsEarned = isCorrect ? question.points : 0;
            }

            totalScore += pointsEarned;

            return {
                ...answer,
                isCorrect,
                pointsEarned
            };
        });

        const percentage = (totalScore / exam.totalPoints) * 100;
        const passed = percentage >= exam.passingScore;

        submission.answers = gradedAnswers;
        submission.endTime = new Date();
        submission.timeSpent = Math.round((submission.endTime - submission.startTime) / (1000 * 60));
        submission.score = totalScore;
        submission.percentage = percentage;
        submission.passed = passed;
        submission.status = 'submitted';

        const savedSubmission = await submission.save();

        // Background: Notify student of result
        setImmediate(async () => {
            try {
                const student = await User.findById(req.user._id).select('name email profile');
                const exam = await Exam.findById(req.params.id);

                // Centralized Industrial Notification for Exam Results
                notificationService.send(
                    {
                        name: student.name,
                        email: student.email,
                        phone: student.profile?.phone || student.phone
                    },
                    'examResult',
                    {
                        examTitle: exam.title,
                        score: savedSubmission.score,
                        percentage: savedSubmission.percentage,
                        passed: savedSubmission.passed
                    }
                ).catch(err => console.error(`[Exam Result Notif] Engine Error:`, err.message));


                // Real-time result notification
                socketService.sendToUser(
                    student._id,
                    'notification',
                    {
                        type: 'exam_result',
                        title: 'Exam Result Available',
                        message: `Your results for "${exam.title}" are now available. Status: ${savedSubmission.passed ? 'PASSED' : 'RECALIBRATION REQUIRED'}`,
                        examId: exam._id,
                        submissionId: savedSubmission._id
                    }
                );
            } catch (bgErr) {
                console.error('[Submit Exam] Background notification error:', bgErr.message);
            }
        });

        res.json(savedSubmission);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Get exam results
// @route   GET /api/exams/:id/results
// @access  Private
router.get('/:id/results', protect, async (req, res) => {
    try {
        const submissions = await ExamSubmission.find({
            exam: req.params.id,
            student: req.user._id
        }).sort({ attemptNumber: -1 });

        res.json(submissions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Update exam
// @route   PUT /api/exams/:id
// @access  Private (Instructor/Admin)
router.put('/:id', protect, authorize('university', 'admin'), async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);

        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        // Check if user owns this exam or is admin
        if (exam.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const wasPublished = exam.isPublished;
        Object.assign(exam, req.body);

        // Recalculate total points if questions changed
        if (req.body.questions) {
            exam.totalPoints = exam.questions.reduce((total, q) => total + q.points, 0);
        }

        const updatedExam = await exam.save();

        // If just published, notify students
        if (!wasPublished && updatedExam.isPublished) {
            setImmediate(async () => {
                try {
                    const course = await Course.findById(updatedExam.course);
                    const enrollments = await Enrollment.find({
                        course: updatedExam.course,
                        status: 'active'
                    }).populate('student', '_id name email profile phone');

                    const students = enrollments.map(e => e.student).filter(s => !!s);

                    for (const student of students) {
                        notificationService.send(
                            {
                                _id: student._id,
                                name: student.name,
                                email: student.email,
                                phone: student.profile?.phone || student.phone
                            },
                            'exam',
                            {
                                examTitle: updatedExam.title,
                                courseTitle: course.title,
                                date: updatedExam.scheduledDate
                            }
                        ).catch(err => console.error(`[Exam Update Notif] Error:`, err.message));

                        socketService.sendToUser(
                            student._id,
                            'notification',
                            {
                                type: 'exam_scheduled',
                                title: 'New Exam Available',
                                message: `An exam "${updatedExam.title}" is now available for ${course.title}.`,
                                examId: updatedExam._id
                            }
                        );
                    }
                } catch (bgErr) {
                    console.error('[Update Exam] Background notification error:', bgErr.message);
                }
            });
        }

        res.json(updatedExam);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Delete exam
// @route   DELETE /api/exams/:id
// @access  Private (Instructor/Admin)
router.delete('/:id', protect, authorize('university', 'admin'), async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);

        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        // Check if user owns this exam or is admin
        if (exam.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await exam.deleteOne();
        res.json({ message: 'Exam deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;