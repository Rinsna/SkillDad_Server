const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/userModel');
const Enrollment = require('../models/enrollmentModel');
const Course = require('../models/courseModel');
const Progress = require('../models/progressModel');

async function fix() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const student = await User.findOne({ name: /Rinsna/i });
        const uni = await User.findOne({ role: 'university' });

        if (student && uni) {
            student.universityId = uni._id;
            await student.save();
            console.log(`Assigned student ${student.name} to University ${uni.name}`);
        }

        // Ensure enrollment is complete with some detail
        const course = await Course.findOne({ title: /Complete React Development Bootcamp/i });
        if (course && student) {
            const enrollment = await Enrollment.findOne({ student: student._id, course: course._id });
            if (enrollment) {
                enrollment.totalModules = course.modules?.length || 0;
                await enrollment.save();
                console.log('Updated enrollment detail (modules)');
            }
        }

        console.log('Successfully refined student details');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fix();
