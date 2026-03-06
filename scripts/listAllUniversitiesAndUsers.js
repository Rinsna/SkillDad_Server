const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const listAll = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!\n');

        const User = require('../models/userModel');
        const Course = require('../models/courseModel');
        
        console.log('='.repeat(80));
        console.log('ALL UNIVERSITIES IN DATABASE');
        console.log('='.repeat(80));
        
        const universities = await User.find({ role: 'university' }).select('name email profile.universityName');
        
        console.log(`\nFound ${universities.length} universities:\n`);
        universities.forEach((uni, index) => {
            console.log(`${index + 1}. ${uni.name}`);
            console.log(`   Email: ${uni.email}`);
            console.log(`   University Name: ${uni.profile?.universityName || 'N/A'}`);
            console.log(`   ID: ${uni._id}`);
            console.log('-'.repeat(80));
        });
        
        console.log('\n' + '='.repeat(80));
        console.log('ALL STUDENTS IN DATABASE');
        console.log('='.repeat(80));
        
        const students = await User.find({ role: 'student' }).select('name email profile.universityName');
        
        console.log(`\nFound ${students.length} students:\n`);
        students.forEach((student, index) => {
            console.log(`${index + 1}. ${student.name}`);
            console.log(`   Email: ${student.email}`);
            console.log(`   University: ${student.profile?.universityName || 'N/A'}`);
            console.log(`   ID: ${student._id}`);
            if (index < students.length - 1) console.log('-'.repeat(80));
        });
        
        console.log('\n' + '='.repeat(80));
        console.log('ALL COURSES WITH UNIVERSITY NAMES');
        console.log('='.repeat(80));
        
        const courses = await Course.find().select('title universityName instructorName category');
        
        const uniqueUniversities = [...new Set(courses.map(c => c.universityName).filter(Boolean))];
        
        console.log(`\nUnique university names in courses: ${uniqueUniversities.length}\n`);
        uniqueUniversities.forEach((uni, index) => {
            console.log(`${index + 1}. ${uni}`);
            const coursesForUni = courses.filter(c => c.universityName === uni);
            coursesForUni.forEach(course => {
                console.log(`   - ${course.title} (${course.category})`);
            });
        });
        
        console.log('\n' + '='.repeat(80));
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

listAll();
