const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });
const User = require('./models/userModel');
const Course = require('./models/courseModel');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const user = await User.findOne({ role: { $in: ['admin', 'university'] } });
        if (!user) {
            console.log('No admin/university user found!');
            process.exit(0);
        }

        console.log('Found User:', user.name, 'Role:', user.role, 'ID:', user._id);

        const course = await Course.findOne({ instructor: user._id });
        if (!course) {
            console.log('Creating dummy course for user...');
            const newCourse = await Course.create({
                title: 'Introduction to Full-Stack Development',
                description: 'A comprehensive guide to modern web development.',
                category: 'Computer Science',
                price: 99,
                instructor: user._id,
                instructorName: user.name,
                universityName: user.profile?.universityName || 'SkillDad University',
                isPublished: true
            });
            console.log('Created Course:', newCourse.title, 'ID:', newCourse._id);
        } else {
            console.log('Course already exists:', course.title);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
