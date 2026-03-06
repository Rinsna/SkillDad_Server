const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const checkCourses = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!\n');

        const Course = require('../models/courseModel');
        
        const courses = await Course.find().select('title category level price createdBy createdAt');
        
        console.log(`Found ${courses.length} courses in database:\n`);
        console.log('='.repeat(80));
        
        courses.forEach((course, index) => {
            console.log(`${index + 1}. ${course.title}`);
            console.log(`   Category: ${course.category || 'N/A'}`);
            console.log(`   Level: ${course.level || 'N/A'}`);
            console.log(`   Price: ₹${course.price || 0}`);
            console.log(`   Created: ${course.createdAt ? new Date(course.createdAt).toLocaleDateString() : 'N/A'}`);
            console.log(`   ID: ${course._id}`);
            console.log('-'.repeat(80));
        });
        
        // Search for React courses specifically
        const reactCourses = courses.filter(c => 
            c.title.toLowerCase().includes('react')
        );
        
        if (reactCourses.length > 0) {
            console.log(`\n✅ Found ${reactCourses.length} React course(s):`);
            reactCourses.forEach(course => {
                console.log(`   - ${course.title} (ID: ${course._id})`);
            });
        } else {
            console.log('\n⚠️  No React courses found in database');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

checkCourses();
