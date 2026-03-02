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

        const newCourse = await Course.create({
            title: 'Full-Stack Next.js Mastery 2026',
            description: 'Advanced web development course.',
            category: 'Computer Science',
            price: 199,
            instructor: user._id,
            instructorName: user.name,
            universityName: user.profile?.universityName || 'SkillDad University',
            isPublished: true,
            modules: []
        });
        console.log('Created Course:', newCourse.title, 'ID:', newCourse._id);

        process.exit(0);
    } catch (err) {
        console.error('ERROR CREATING COURSE:', err);
        process.exit(1);
    }
}

check();
