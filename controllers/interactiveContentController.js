const asyncHandler = require('express-async-handler');
const InteractiveContent = require('../models/interactiveContentModel');
const Course = require('../models/courseModel');
const Submission = require('../models/submissionModel');
const Enrollment = require('../models/enrollmentModel');

// @desc    Create interactive content for a module
// @route   POST /api/courses/:courseId/modules/:moduleId/content
// @access  Private (University/Admin)
const createContent = asyncHandler(async (req, res) => {
    const { courseId, moduleId } = req.params;
    const { type, title, description, instructions, timeLimit, attemptsAllowed, passingScore, showSolutionAfter, questions } = req.body;

    // Fetch course and verify ownership
    const course = await Course.findById(courseId);
    
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Verify ownership (Requirement 1.3, 12.2, 12.3)
    if (course.instructor && course.instructor.toString() !== req.user.id && req.user.role !== 'admin') {
        res.status(403);
        throw new Error('Not authorized to create content for this course');
    }

    // Find the module
    const module = course.modules.id(moduleId);
    if (!module) {
        res.status(404);
        throw new Error('Module not found');
    }

    // Validate required fields (Requirement 1.1, 1.2)
    if (!type || !title || !description || !instructions || !questions || questions.length === 0) {
        res.status(400);
        throw new Error('Missing required fields: type, title, description, instructions, and at least one question');
    }

    // Create interactive content (Requirement 1.1, 1.7)
    const content = await InteractiveContent.create({
        type,
        title,
        description,
        instructions,
        timeLimit,
        attemptsAllowed: attemptsAllowed !== undefined ? attemptsAllowed : -1,
        passingScore,
        showSolutionAfter: showSolutionAfter || 'submission',
        questions
    });

    // Add content to module (Requirement 20.1)
    module.interactiveContent.push(content._id);
    await course.save();

    res.status(201).json({
        success: true,
        contentId: content._id,
        content
    });
});

// @desc    Update interactive content
// @route   PUT /api/courses/:courseId/modules/:moduleId/content/:contentId
// @access  Private (University/Admin)
const updateContent = asyncHandler(async (req, res) => {
    const { courseId, contentId } = req.params;
    const updates = req.body;

    // Fetch course and verify ownership
    const course = await Course.findById(courseId);
    
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Verify ownership (Requirement 2.1, 12.3)
    if (course.instructor && course.instructor.toString() !== req.user.id && req.user.role !== 'admin') {
        res.status(403);
        throw new Error('Not authorized to update content for this course');
    }

    // Find and update content
    const content = await InteractiveContent.findById(contentId);
    
    if (!content) {
        res.status(404);
        throw new Error('Interactive content not found');
    }

    // Update allowed fields (Requirement 2.1, 2.4)
    const allowedUpdates = ['title', 'description', 'instructions', 'timeLimit', 'attemptsAllowed', 'passingScore', 'showSolutionAfter', 'questions'];
    
    allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
            content[field] = updates[field];
        }
    });

    await content.save();

    res.status(200).json({
        success: true,
        content
    });
});

// @desc    Delete interactive content
// @route   DELETE /api/courses/:courseId/modules/:moduleId/content/:contentId
// @access  Private (University/Admin)
const deleteContent = asyncHandler(async (req, res) => {
    const { courseId, moduleId, contentId } = req.params;

    // Fetch course and verify ownership
    const course = await Course.findById(courseId);
    
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Verify ownership (Requirement 2.2, 12.3)
    if (course.instructor && course.instructor.toString() !== req.user.id && req.user.role !== 'admin') {
        res.status(403);
        throw new Error('Not authorized to delete content from this course');
    }

    // Find the module
    const module = course.modules.id(moduleId);
    if (!module) {
        res.status(404);
        throw new Error('Module not found');
    }

    // Remove content reference from module (Requirement 2.2)
    const contentIndex = module.interactiveContent.indexOf(contentId);
    if (contentIndex > -1) {
        module.interactiveContent.splice(contentIndex, 1);
        await course.save();
    }

    // Delete the content document
    const content = await InteractiveContent.findById(contentId);
    if (content) {
        await content.deleteOne();
    }

    // Note: Submissions are preserved as per Requirement 2.4
    // They remain in the database for historical records

    res.status(200).json({
        success: true,
        message: 'Content deleted successfully',
        contentId
    });
});

// @desc    Get all interactive content for a module
// @route   GET /api/courses/:courseId/modules/:moduleId/content
// @access  Public (enrolled students can access)
const getModuleContent = asyncHandler(async (req, res) => {
    const { courseId, moduleId } = req.params;

    // Fetch course
    const course = await Course.findById(courseId);
    
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Find the module
    const module = course.modules.id(moduleId);
    if (!module) {
        res.status(404);
        throw new Error('Module not found');
    }

    // If user is authenticated and is a student, check enrollment (Requirement 4.4)
    if (req.user && req.user.role === 'student') {
        const enrollment = await Enrollment.findOne({
            student: req.user.id,
            course: courseId,
            status: 'active'
        });

        if (!enrollment) {
            res.status(403);
            throw new Error('You must be enrolled in this course to access content');
        }
    }

    // Populate interactive content (Requirement 4.1, 4.2, 20.2)
    const content = await InteractiveContent.find({
        _id: { $in: module.interactiveContent }
    });

    // If user is authenticated and is a student, include attempt information
    let contentWithAttempts = content;
    
    if (req.user && req.user.role === 'student') {
        // Get submission counts for this user (Requirement 4.3)
        contentWithAttempts = await Promise.all(content.map(async (item) => {
            const submissionCount = await Submission.countDocuments({
                user: req.user.id,
                content: item._id
            });

            const itemObj = item.toObject();
            itemObj.userAttempts = submissionCount;
            itemObj.remainingAttempts = item.attemptsAllowed === -1 
                ? 'unlimited' 
                : Math.max(0, item.attemptsAllowed - submissionCount);

            return itemObj;
        }));
    }

    res.status(200).json({
        success: true,
        content: contentWithAttempts
    });
});

// @desc    Reorder interactive content within a module
// @route   PUT /api/courses/:courseId/modules/:moduleId/content/reorder
// @access  Private (University/Admin)
const reorderContent = asyncHandler(async (req, res) => {
    const { courseId, moduleId } = req.params;
    const { contentIds } = req.body;

    // Validate input
    if (!contentIds || !Array.isArray(contentIds)) {
        res.status(400);
        throw new Error('contentIds must be an array');
    }

    // Fetch course and verify ownership
    const course = await Course.findById(courseId);
    
    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Verify ownership (Requirement 2.3, 12.3)
    if (course.instructor && course.instructor.toString() !== req.user.id && req.user.role !== 'admin') {
        res.status(403);
        throw new Error('Not authorized to reorder content for this course');
    }

    // Find the module
    const module = course.modules.id(moduleId);
    if (!module) {
        res.status(404);
        throw new Error('Module not found');
    }

    // Verify all content IDs exist in the module
    const currentContentIds = module.interactiveContent.map(id => id.toString());
    const allIdsValid = contentIds.every(id => currentContentIds.includes(id));

    if (!allIdsValid || contentIds.length !== currentContentIds.length) {
        res.status(400);
        throw new Error('Invalid content IDs or mismatched count');
    }

    // Update the order (Requirement 2.3, 20.3)
    module.interactiveContent = contentIds;
    await course.save();

    res.status(200).json({
        success: true,
        message: 'Content reordered successfully',
        contentIds: module.interactiveContent
    });
});

module.exports = {
    createContent,
    updateContent,
    deleteContent,
    getModuleContent,
    reorderContent
};
