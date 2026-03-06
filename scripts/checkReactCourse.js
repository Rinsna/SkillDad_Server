const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const checkReactCourse = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!\n');

        const Course = require('../models/courseModel');
        
        const reactCourse = await Course.findOne({ 
            title: /react/i 
        });
        
        if (reactCourse) {
            console.log('✅ Found React Course:\n');
            console.log('Title:', reactCourse.title);
            console.log('Category:', reactCourse.category);
            console.log('Price:', reactCourse.price);
            console.log('Is Published:', reactCourse.isPublished);
            console.log('Created At:', reactCourse.createdAt);
            console.log('ID:', reactCourse._id);
            console.log('\n');
            
            if (!reactCourse.isPublished) {
                console.log('⚠️  ISSUE FOUND: Course is NOT published!');
                console.log('This is why it\'s not showing in the course catalog.');
                console.log('\nTo fix this, you need to:');
                console.log('1. Go to Admin Panel → Courses');
                console.log('2. Edit the React course');
                console.log('3. Check the "Published" checkbox');
                console.log('4. Save the course');
            } else {
                console.log('✅ Course is published and should be visible');
            }
        } else {
            console.log('❌ No React course found');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

checkReactCourse();
