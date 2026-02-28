const asyncHandler = require('express-async-handler');
const Course = require('../models/courseModel');

// @desc    Get all courses (optionally filtered by university)
// @route   GET /api/courses?university=<userId>
// @access  Public
const getCourses = asyncHandler(async (req, res) => {
    try {
        let filter = { isPublished: true };

        // Filter by university (instructor) if provided
        if (req.query.university) {
            filter.instructor = req.query.university;
        }

        const courses = await Course.find(filter)
            .populate({
                path: 'instructor',
                select: 'name profile role',
                options: { strictPopulate: false }
            })
            .lean();

        const validCourses = courses.map(course => {
            return {
                ...course,
                title: course.title || 'Untitled Course',
                description: course.description || 'No description provided',
                category: course.category || 'General',
                thumbnail: course.thumbnail || '',
                price: course.price || 0,
                instructor: course.instructor || {
                    name: course.instructorName || 'Academic Facilitator',
                    profile: { universityName: course.universityName || '' },
                    role: 'university'
                },
                instructorName: course.instructorName || (course.instructor ? course.instructor.name : 'Academic Facilitator'),
                universityName: course.universityName || (course.instructor?.profile ? course.instructor.profile.universityName : '')
            };
        });

        res.status(200).json(validCourses);
    } catch (error) {
        console.error('Error in getCourses:', error);
        res.status(500).json({ message: 'Error fetching courses', error: error.message });
    }
});


// @desc    Get all courses (Admin/Instructor version)
// @route   GET /api/admin/courses
// @access  Private (Admin/Instructor)
const getAdminCourses = asyncHandler(async (req, res) => {
    try {
        let filter = {};
        if (req.user.role !== 'admin') {
            filter.instructor = req.user.id;
        }
        const courses = await Course.find(filter)
            .populate({
                path: 'instructor',
                select: 'name profile role',
                options: { strictPopulate: false }
            })
            .sort('-createdAt')
            .lean();

        // Handle missing instructors
        const validCourses = courses.map(course => {
            if (!course.instructor) {
                course.instructor = {
                    name: course.instructorName || 'Unknown Instructor',
                    profile: {},
                    role: 'university'
                };
            }
            return course;
        });

        res.status(200).json(validCourses);
    } catch (error) {
        console.error('Error in getAdminCourses:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ message: 'Error fetching admin courses', error: error.message });
    }
});

// @desc    Get single course
// @route   GET /api/courses/:id
// @access  Public
const getCourse = asyncHandler(async (req, res) => {
    // Handle frontend fallback courses safely
    if (req.params.id === 'mock1') {
        return res.status(200).json({
            _id: 'mock1',
            title: 'Complete Web Development Bootcamp 2024',
            description: 'Master HTML, CSS, JavaScript, React, Node.js and more.',
            thumbnail: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=800',
            category: 'Web Development',
            price: 99,
            instructor: { name: 'Dr. Angela Yu', role: 'university', profile: { universityName: 'London App Brewery' } },
            modules: []
        });
    }

    if (req.params.id === 'mock2') {
        return res.status(200).json({
            _id: 'mock2',
            title: 'Advanced AI & Machine Learning',
            description: 'Learn deep learning, neural networks, and computer vision.',
            thumbnail: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=800',
            category: 'Artificial Intelligence',
            price: 149,
            instructor: { name: 'Prof. Andrew Ng', role: 'university', profile: { universityName: 'Stanford Online' } },
            modules: []
        });
    }

    // Protect against severe DB CastErrors for invalid IDs
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
        res.status(404);
        throw new Error('Course not found');
    }

    const course = await Course.findById(req.params.id)
        .populate({
            path: 'instructor',
            select: 'name profile role',
            options: { strictPopulate: false }
        })
        .lean();

    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Handle missing instructor
    if (!course.instructor) {
        course.instructor = {
            name: course.instructorName || 'Unknown Instructor',
            profile: {},
            role: 'university'
        };
    }

    res.status(200).json(course);
});

// @desc    Create new course
// @route   POST /api/courses
// @access  Private (Admin/Instructor)
const createCourse = asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'university') {
        res.status(401);
        throw new Error('Not authorized to create courses');
    }

    const course = await Course.create({
        instructor: req.user.id,
        instructorName: req.body.instructorName,
        universityName: req.body.universityName,
        title: req.body.title || 'Untitled Course',
        description: req.body.description || 'No description',
        category: req.body.category || 'General',
        price: req.body.price || 0,
        isPublished: req.body.isPublished !== undefined ? req.body.isPublished : false,
    });

    res.status(201).json(course);
});

// @desc    Update course
// @route   PUT /api/courses/:id
// @access  Private (Admin/Instructor)
const updateCourse = asyncHandler(async (req, res) => {
    const course = await Course.findById(req.params.id);

    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    // Check ownership or admin
    if (course.instructor && course.instructor.toString() !== req.user.id && req.user.role !== 'admin') {
        res.status(401);
        throw new Error('Not authorized to update this course');
    }

    // Extract only the fields we want to allow updating
    const {
        title,
        description,
        category,
        price,
        instructorName,
        universityName,
        isPublished,
        thumbnail
    } = req.body;

    if (title) course.title = title;
    if (description) course.description = description;
    if (category) course.category = category;
    if (price !== undefined) course.price = price;
    if (instructorName !== undefined) course.instructorName = instructorName;
    if (universityName !== undefined) course.universityName = universityName;
    if (isPublished !== undefined) course.isPublished = isPublished;
    if (thumbnail) course.thumbnail = thumbnail;

    const updatedCourse = await course.save();

    res.status(200).json(updatedCourse);
});

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Private (Admin/Instructor)
const deleteCourse = asyncHandler(async (req, res) => {
    const course = await Course.findById(req.params.id);

    if (!course) {
        res.status(404);
        throw new Error('Course not found');
    }

    if (course.instructor && course.instructor.toString() !== req.user.id && req.user.role !== 'admin') {
        res.status(401);
        throw new Error('Not authorized');
    }

    await course.deleteOne();

    res.status(200).json({ id: req.params.id });
});

// @desc    Add a module to a course
// @route   POST /api/courses/:id/modules
// @access  Private (Admin/Instructor)
const addModule = asyncHandler(async (req, res) => {
    const { title } = req.body;
    const course = await Course.findById(req.params.id);

    if (course) {
        if (course.instructor && course.instructor.toString() !== req.user.id && req.user.role !== 'admin') {
            res.status(401);
            throw new Error('Not authorized');
        }

        const newModule = {
            title,
            videos: [],
        };

        course.modules.push(newModule);
        await course.save();
        res.status(201).json(course);
    } else {
        res.status(404);
        throw new Error('Course not found');
    }
});

// @desc    Add a video to a module
// @route   POST /api/courses/:id/modules/:moduleId/videos
// @access  Private (Admin/Instructor)
const addVideo = asyncHandler(async (req, res) => {
    const { title, url, duration } = req.body;
    const course = await Course.findById(req.params.id);

    if (course) {
        if (course.instructor && course.instructor.toString() !== req.user.id && req.user.role !== 'admin') {
            res.status(401);
            throw new Error('Not authorized');
        }

        const module = course.modules.id(req.params.moduleId);
        if (module) {
            const newVideo = {
                title,
                url,
                duration,
                exercises: []
            };
            module.videos.push(newVideo);
            await course.save();
            res.status(201).json(course);
        } else {
            res.status(404);
            throw new Error('Module not found');
        }
    } else {
        res.status(404);
        throw new Error('Course not found');
    }
});

// @desc    Add an exercise to a video
// @route   POST /api/courses/:id/modules/:moduleId/videos/:videoId/exercises
// @access  Private (Admin/Instructor)
const addExercise = asyncHandler(async (req, res) => {
    const { question, options, correctAnswer, type } = req.body;
    const course = await Course.findById(req.params.id);

    if (course) {
        if (course.instructor && course.instructor.toString() !== req.user.id && req.user.role !== 'admin') {
            res.status(401);
            throw new Error('Not authorized');
        }

        const module = course.modules.id(req.params.moduleId);
        if (module) {
            const video = module.videos.id(req.params.videoId);
            if (video) {
                video.exercises.push({ question, options, correctAnswer, type });
                await course.save();
                res.status(201).json(course);
            } else {
                res.status(404);
                throw new Error('Video not found');
            }
        } else {
            res.status(404);
            throw new Error('Module not found');
        }
    } else {
        res.status(404);
        throw new Error('Course not found');
    }
});

module.exports = {
    getCourses,
    getCourse,
    createCourse,
    updateCourse,
    deleteCourse,
    addModule,
    addVideo,
    addExercise,
    getAdminCourses
};
