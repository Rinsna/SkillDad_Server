const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Course = require('./models/courseModel');
const User = require('./models/userModel');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const courses = await Course.find({}).populate('instructor', 'name role profile');
        console.log('---BEGIN---');
        console.log(JSON.stringify(courses, null, 2));
        console.log('---END---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
