const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, authorize } = require('../middleware/authMiddleware');
const Project = require('../models/projectModel');
const ProjectSubmission = require('../models/projectSubmissionModel');
const socketService = require('../services/SocketService');

// Configure multer for project file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/projects/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit for projects
    }
});

// @desc    Get all projects (Admin only)
// @route   GET /api/projects
// @access  Private (Admin)
router.get('/', protect, authorize('admin'), async (req, res) => {
    try {
        const projects = await Project.find()
            .populate('course', 'title')
            .populate('instructor', 'name email')
            .sort({ createdAt: -1 });

        res.json(projects);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get all projects for a course
// @route   GET /api/projects/course/:courseId
// @access  Private
router.get('/course/:courseId', protect, async (req, res) => {
    try {
        const projects = await Project.find({
            course: req.params.courseId,
            isPublished: true
        }).populate('instructor', 'name email')
            .sort({ deadline: 1 });

        // If student, include submission status
        if (req.user.role === 'student') {
            const submissions = await ProjectSubmission.find({
                project: { $in: projects.map(p => p._id) },
                student: req.user._id
            });

            const projectsWithStatus = projects.map(project => {
                const submission = submissions.find(s => s.project.toString() === project._id.toString());
                return {
                    ...project.toObject(),
                    submission: submission || null,
                    status: submission ? submission.status : 'not-started'
                };
            });

            return res.json(projectsWithStatus);
        }

        res.json(projects);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get student's projects
// @route   GET /api/projects/my-projects
// @access  Private (Student)
router.get('/my-projects', protect, async (req, res) => {
    try {
        // Get courses the student is enrolled in
        const enrollments = await require('../models/enrollmentModel').find({
            student: req.user._id,
            status: 'active'
        }).populate('course');

        const courseIds = enrollments.map(e => e.course._id);

        const projects = await Project.find({
            course: { $in: courseIds },
            isPublished: true
        }).populate('course', 'title')
            .populate('instructor', 'name')
            .sort({ deadline: 1 });

        // Get student's submissions
        const submissions = await ProjectSubmission.find({
            project: { $in: projects.map(p => p._id) },
            student: req.user._id
        });

        const projectsWithStatus = projects.map(project => {
            const submission = submissions.find(s => s.project.toString() === project._id.toString());
            return {
                ...project.toObject(),
                submission: submission || null,
                status: submission ? submission.status : 'not-started'
            };
        });

        res.json(projectsWithStatus);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get project by ID
// @route   GET /api/projects/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const project = await Project.findById(req.params.id)
            .populate('course', 'title')
            .populate('instructor', 'name email');

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // If student, include their submission
        if (req.user.role === 'student') {
            const submission = await ProjectSubmission.findOne({
                project: project._id,
                student: req.user._id
            });

            return res.json({
                ...project.toObject(),
                submission: submission || null
            });
        }

        res.json(project);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Create new project
// @route   POST /api/projects
// @access  Private (Instructor/Admin)
router.post('/', protect, authorize('university', 'admin'), async (req, res) => {
    try {
        const project = new Project({
            ...req.body,
            instructor: req.user._id
        });

        const savedProject = await project.save();
        await savedProject.populate('course', 'title');
        await savedProject.populate('instructor', 'name email');

        res.status(201).json(savedProject);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Submit project
// @route   POST /api/projects/:id/submit
// @access  Private (Student)
router.post('/:id/submit', protect, upload.array('files', 10), async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check if deadline has passed
        if (new Date() > project.deadline) {
            return res.status(400).json({ message: 'Project deadline has passed' });
        }

        // Check for existing submission
        let submission = await ProjectSubmission.findOne({
            project: project._id,
            student: req.user._id
        });

        const files = req.files ? req.files.map(file => ({
            fileName: file.originalname,
            fileUrl: file.path,
            fileSize: file.size
        })) : [];

        if (submission) {
            // Update existing submission
            submission.files = files;
            submission.submissionText = req.body.submissionText || '';
            submission.status = 'submitted';
            submission.submittedAt = new Date();
            submission.isLate = new Date() > project.deadline;
        } else {
            // Create new submission
            submission = new ProjectSubmission({
                project: project._id,
                student: req.user._id,
                files: files,
                submissionText: req.body.submissionText || '',
                status: 'submitted',
                submittedAt: new Date(),
                isLate: new Date() > project.deadline
            });
        }

        const savedSubmission = await submission.save();
        await savedSubmission.populate('project', 'title');

        // Real-time: Notify instructor
        if (project.instructor) {
            socketService.sendToUser(
                project.instructor,
                'notification',
                {
                    type: 'project_submission',
                    title: 'New Project Submission',
                    message: `${req.user.name} has submitted "${project.title}".`,
                    projectId: project._id,
                    submissionId: savedSubmission._id
                }
            );
        }

        res.status(201).json(savedSubmission);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Get project submissions (for instructors)
// @route   GET /api/projects/:id/submissions
// @access  Private (Instructor/Admin)
router.get('/:id/submissions', protect, authorize('university', 'admin'), async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check if user owns this project or is admin
        if (project.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const submissions = await ProjectSubmission.find({ project: project._id })
            .populate('student', 'name email')
            .sort({ submittedAt: -1 });

        res.json(submissions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Grade project submission
// @route   PUT /api/projects/submissions/:submissionId/grade
// @access  Private (Instructor/Admin)
router.put('/submissions/:submissionId/grade', protect, authorize('university', 'admin'), async (req, res) => {
    try {
        const { grade, score, feedback, rubricScores } = req.body;

        const submission = await ProjectSubmission.findById(req.params.submissionId)
            .populate('project');

        if (!submission) {
            return res.status(404).json({ message: 'Submission not found' });
        }

        // Check if user owns this project or is admin
        if (submission.project.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        submission.grade = grade;
        submission.score = score;
        submission.feedback = feedback;
        submission.rubricScores = rubricScores || [];
        submission.status = 'graded';
        submission.gradedBy = req.user._id;
        submission.gradedAt = new Date();

        const updatedSubmission = await submission.save();
        await updatedSubmission.populate('student', 'name email');
        await updatedSubmission.populate('gradedBy', 'name');

        // Real-time: Notify student
        socketService.sendToUser(
            updatedSubmission.student._id,
            'notification',
            {
                type: 'project_graded',
                title: 'Project Graded!',
                message: `Your project "${submission.project.title}" has been graded. Score: ${updatedSubmission.score}%`,
                projectId: submission.project._id,
                submissionId: updatedSubmission._id
            }
        );

        res.json(updatedSubmission);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Get student's submission for a project
// @route   GET /api/projects/:id/my-submission
// @access  Private (Student)
router.get('/:id/my-submission', protect, async (req, res) => {
    try {
        const submission = await ProjectSubmission.findOne({
            project: req.params.id,
            student: req.user._id
        }).populate('project', 'title deadline')
            .populate('gradedBy', 'name');

        if (!submission) {
            return res.status(404).json({ message: 'No submission found' });
        }

        res.json(submission);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private (Instructor/Admin)
router.put('/:id', protect, authorize('university', 'admin'), async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check if user owns this project or is admin
        if (project.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        Object.assign(project, req.body);
        const updatedProject = await project.save();

        res.json(updatedProject);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private (Instructor/Admin)
router.delete('/:id', protect, authorize('university', 'admin'), async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check if user owns this project or is admin
        if (project.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await project.deleteOne();
        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;