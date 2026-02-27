const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/userModel');
const Enrollment = require('../models/enrollmentModel');

async function simulate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const students = await User.find({ role: 'student' }).populate('universityId', 'name profile');
        const results = await Promise.all(students.map(async (student) => {
            const enrollmentCount = await Enrollment.countDocuments({ student: student._id });
            return {
                name: student.name,
                enrollmentCount
            };
        }));
        console.log(JSON.stringify(results.filter(r => r.name.includes('Rinsna')), null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
simulate();
