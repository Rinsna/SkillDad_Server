const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Course = require('./models/courseModel');
const User = require('./models/userModel');

dotenv.config({ path: path.join(__dirname, '.env') });

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const courses = await Course.find().populate('instructor', 'name email role');
        console.log(`Checking ${courses.length} courses...`);

        courses.forEach(c => {
            console.log(`- Course: ${c.title}, Instructor: ${c.instructor?.name} (${c.instructor?._id}), Role: ${c.instructor?.role}`);
        });

        const unis = await User.find({ role: 'university' });
        console.log(`Total universities in DB: ${unis.length}`);
        unis.forEach(u => {
            console.log(`- Uni: ${u.name} (${u._id})`);
        });

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
};

check();
