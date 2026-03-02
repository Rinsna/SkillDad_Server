const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });
const User = require('./models/userModel');
const Course = require('./models/courseModel');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const userCount = await User.countDocuments();
        const courseCount = await Course.countDocuments();
        const users = await User.find({}, 'name role email');
        const courses = await Course.find({}, 'title instructor');

        console.log('--- DATABASE STATUS ---');
        console.log('Total Users:', userCount);
        console.log('Total Courses:', courseCount);
        console.log('Users List:', users);
        console.log('Courses List:', courses);
        console.log('-----------------------');

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
