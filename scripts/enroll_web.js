const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/userModel');
const Enrollment = require('../models/enrollmentModel');
const Course = require('../models/courseModel');
const Progress = require('../models/progressModel');

async function enrollWeb() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const student = await User.findOne({ name: /Rinsna/i });
        const course = await Course.findOne({ title: /Web Development with React/i });

        if (student && course) {
            // Enrollment
            const existingEnrollment = await Enrollment.findOne({ student: student._id, course: course._id });
            if (!existingEnrollment) {
                await Enrollment.create({
                    student: student._id,
                    course: course._id,
                    status: 'active',
                    progress: 0,
                    totalModules: course.modules?.length || 0
                });
                console.log('Enrolled in Web Development with React');
            }

            // Progress
            const existingProgress = await Progress.findOne({ user: student._id, course: course._id });
            if (!existingProgress) {
                await Progress.create({
                    user: student._id,
                    course: course._id,
                    completedVideos: [],
                    completedExercises: []
                });
                console.log('Progress record created for Web Dev');
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
enrollWeb();
