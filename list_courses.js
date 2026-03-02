const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/userModel'); // Import User model for populate
const Course = require('./models/courseModel');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const courses = await Course.find({}).populate('instructor', 'name');
        console.log('---COURSES---');
        courses.forEach(c => {
            console.log(`Title: ${c.title}, Instructor ID: ${c.instructor ? c.instructor._id : 'N/A'}, Instructor Name: ${c.instructor ? c.instructor.name : 'N/A'}`);
        });
        console.log('---END---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
