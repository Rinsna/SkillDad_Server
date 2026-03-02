const mongoose = require('mongoose');
const Course = require('./models/courseModel');
const User = require('./models/userModel');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const courses = await Course.find({ instructor: { $ne: null } }).select('title instructor');
        console.log('Courses with instructors:');
        console.log(JSON.stringify(courses, null, 2));

        const unis = await User.find({ role: 'university' }).select('_id name');
        console.log('Universities:');
        console.log(JSON.stringify(unis, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        mongoose.connection.close();
    }
};
run();
