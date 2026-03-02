const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/userModel');
const Course = require('./models/courseModel');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const sara = await User.findOne({ name: 'Dr. Sara Wilson' });
        if (!sara) {
            console.log('Dr. Sara Wilson not found');
            process.exit(1);
        }
        const courses = await Course.find({ instructor: sara._id });
        console.log(`---COURSES FOR ${sara.name}---`);
        courses.forEach(c => {
            console.log(`- ${c.title} (${c.isPublished ? 'Published' : 'Draft'})`);
        });
        console.log('---END---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
