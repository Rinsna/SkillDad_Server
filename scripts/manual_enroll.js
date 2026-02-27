const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/userModel');
const Course = require('../models/courseModel');
const Enrollment = require('../models/enrollmentModel');
const Progress = require('../models/progressModel');

async function enroll() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const studentName = 'Rinsna C';
        const courseTitleSearch = 'Complete React Development Bootcamp';

        const student = await User.findOne({ name: new RegExp(studentName, 'i') });
        if (!student) {
            console.error(`Student "${studentName}" not found`);
            process.exit(1);
        }

        const course = await Course.findOne({ title: new RegExp(courseTitleSearch, 'i') });
        if (!course) {
            console.error(`Course "${courseTitleSearch}" not found`);
            process.exit(1);
        }

        console.log(`Enrolling ${student.name} (${student._id}) in ${course.title} (${course._id})`);

        // Check if already enrolled in Enrollment
        const existingEnrollment = await Enrollment.findOne({ student: student._id, course: course._id });
        if (existingEnrollment) {
            console.log('Enrollment record already exists');
        } else {
            await Enrollment.create({
                student: student._id,
                course: course._id,
                status: 'active',
                progress: 0
            });
            console.log('Enrollment record created');
        }

        // Check if already enrolled in Progress
        const existingProgress = await Progress.findOne({ user: student._id, course: course._id });
        if (existingProgress) {
            console.log('Progress record already exists');
        } else {
            await Progress.create({
                user: student._id,
                course: course._id,
                completedVideos: [],
                completedExercises: []
            });
            console.log('Progress record created');
        }

        console.log('Successfully enrolled student');
        process.exit(0);
    } catch (err) {
        console.error('Error during enrollment:', err);
        process.exit(1);
    }
}

enroll();
