const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const findSarahWilsonReact = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!\n');

        const Course = require('../models/courseModel');
        const User = require('../models/userModel');
        
        console.log('='.repeat(80));
        console.log('SEARCHING FOR DR. SARAH WILSON\'S COURSES');
        console.log('='.repeat(80));
        
        // Find Dr. Sarah Wilson
        const sarah = await User.findOne({ email: 'sarah.wilson@university.edu' });
        
        if (sarah) {
            console.log('\n✅ Found Dr. Sarah Wilson:');
            console.log('   Name:', sarah.name);
            console.log('   Email:', sarah.email);
            console.log('   Role:', sarah.role);
            console.log('   University:', sarah.profile?.universityName || 'N/A');
            console.log('   ID:', sarah._id);
            
            // Find all courses by this instructor
            const sarahsCourses = await Course.find({
                $or: [
                    { createdBy: sarah._id },
                    { instructor: sarah._id }
                ]
            });
            
            console.log(`\n   Total courses created by Dr. Sarah Wilson: ${sarahsCourses.length}`);
            
            if (sarahsCourses.length > 0) {
                console.log('\n   All courses:');
                sarahsCourses.forEach((course, index) => {
                    console.log(`\n   ${index + 1}. ${course.title}`);
                    console.log(`      Category: ${course.category}`);
                    console.log(`      Price: ₹${course.price}`);
                    console.log(`      Published: ${course.isPublished ? 'Yes' : 'No'}`);
                    console.log(`      University Name: ${course.universityName || 'N/A'}`);
                    console.log(`      ID: ${course._id}`);
                });
                
                // Find React courses
                const reactCourses = sarahsCourses.filter(c => 
                    c.title.toLowerCase().includes('react')
                );
                
                if (reactCourses.length > 0) {
                    console.log('\n' + '='.repeat(80));
                    console.log(`✅ FOUND ${reactCourses.length} REACT COURSE(S) FROM DR. SARAH WILSON:`);
                    console.log('='.repeat(80));
                    reactCourses.forEach(course => {
                        console.log(`\n   Title: ${course.title}`);
                        console.log(`   Category: ${course.category}`);
                        console.log(`   Price: ₹${course.price}`);
                        console.log(`   Published: ${course.isPublished ? 'Yes' : 'No'}`);
                        console.log(`   University: ${course.universityName || 'N/A'}`);
                        console.log(`   Description: ${course.description?.substring(0, 100)}...`);
                        console.log(`   ID: ${course._id}`);
                    });
                } else {
                    console.log('\n⚠️  No React courses found for Dr. Sarah Wilson');
                }
            } else {
                console.log('\n⚠️  No courses found for Dr. Sarah Wilson');
            }
        } else {
            console.log('\n❌ Dr. Sarah Wilson not found');
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('SEARCHING FOR STUDENT: rinsnac44@gmail.com');
        console.log('='.repeat(80));
        
        const student = await User.findOne({ email: 'rinsnac44@gmail.com' });
        
        if (student) {
            console.log('\n✅ Found Student:');
            console.log('   Name:', student.name);
            console.log('   Email:', student.email);
            console.log('   Role:', student.role);
            console.log('   ID:', student._id);
        } else {
            console.log('\n❌ Student with email rinsnac44@gmail.com NOT FOUND in database');
            console.log('\nNote: This email is configured in server/.env as EMAIL_USER');
            console.log('but no user account exists with this email.');
            console.log('\nTo create this student account, you can:');
            console.log('1. Register through the website');
            console.log('2. Or have admin create the account from Admin Panel → Users → Invite User');
        }
        
        console.log('\n' + '='.repeat(80));
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

findSarahWilsonReact();
