const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/userModel');
const Enrollment = require('../models/enrollmentModel');
const Course = require('../models/courseModel');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const students = await User.find({ name: /Rinsna/i });
        console.log('Students Found:', students.map(s => ({ id: s._id, name: s.name, email: s.email, role: s.role })));

        for (const s of students) {
            const count = await Enrollment.countDocuments({ student: s._id });
            const enrolls = await Enrollment.find({ student: s._id }).populate('course', 'title');
            console.log('Student:', s.name, 'Enrollment Count:', count, 'Enrollments:', enrolls.map(e => e.course?.title));
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
