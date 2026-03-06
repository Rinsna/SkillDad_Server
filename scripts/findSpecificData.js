const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const findSpecificData = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!\n');

        const Course = require('../models/courseModel');
        const User = require('../models/userModel');
        
        console.log('='.repeat(80));
        console.log('SEARCHING FOR DR. SARA WILSON\'S REACT COURSE');
        console.log('='.repeat(80));
        
        // First, find Dr. Sara Wilson
        const saraWilson = await User.findOne({
            $or: [
                { name: /sara wilson/i },
                { 'profile.universityName': /sara wilson/i }
            ]
        });
        
        if (saraWilson) {
            console.log('\n✅ Found Dr. Sara Wilson:');
            console.log('   Name:', saraWilson.name);
            console.log('   Email:', saraWilson.email);
            console.log('   Role:', saraWilson.role);
            console.log('   University:', saraWilson.profile?.universityName || 'N/A');
            console.log('   ID:', saraWilson._id);
            
            // Find courses by this instructor
            const sarasCourses = await Course.find({
                $or: [
                    { createdBy: saraWilson._id },
                    { instructor: saraWilson._id },
                    { universityName: saraWilson.profile?.universityName }
                ]
            });
            
            console.log(`\n   Total courses: ${sarasCourses.length}`);
            
            if (sarasCourses.length > 0) {
                console.log('\n   Courses:');
                sarasCourses.forEach((course, index) => {
                    console.log(`   ${index + 1}. ${course.title}`);
                    console.log(`      Category: ${course.category}`);
                    console.log(`      Price: ₹${course.price}`);
                    console.log(`      Published: ${course.isPublished ? 'Yes' : 'No'}`);
                    console.log(`      ID: ${course._id}`);
                });
                
                // Find React courses specifically
                const reactCourses = sarasCourses.filter(c => 
                    c.title.toLowerCase().includes('react')
                );
                
                if (reactCourses.length > 0) {
                    console.log(`\n   ✅ Found ${reactCourses.length} React course(s) from Dr. Sara Wilson:`);
                    reactCourses.forEach(course => {
                        console.log(`      - ${course.title}`);
                        console.log(`        ID: ${course._id}`);
                        console.log(`        Published: ${course.isPublished ? 'Yes' : 'No'}`);
                    });
                } else {
                    console.log('\n   ⚠️  No React courses found for Dr. Sara Wilson');
                }
            } else {
                console.log('\n   ⚠️  No courses found for Dr. Sara Wilson');
            }
        } else {
            console.log('\n❌ Dr. Sara Wilson not found in database');
            
            // Search for any courses with "sara wilson" in university name
            console.log('\nSearching for courses with "Sara Wilson" in university name...');
            const coursesBySara = await Course.find({
                universityName: /sara wilson/i
            });
            
            if (coursesBySara.length > 0) {
                console.log(`\n✅ Found ${coursesBySara.length} course(s) with Sara Wilson university:`);
                coursesBySara.forEach((course, index) => {
                    console.log(`${index + 1}. ${course.title}`);
                    console.log(`   University: ${course.universityName}`);
                    console.log(`   Category: ${course.category}`);
                    console.log(`   Published: ${course.isPublished ? 'Yes' : 'No'}`);
                    console.log(`   ID: ${course._id}`);
                });
                
                const reactCourses = coursesBySara.filter(c => 
                    c.title.toLowerCase().includes('react')
                );
                
                if (reactCourses.length > 0) {
                    console.log(`\n✅ React courses from Sara Wilson university:`);
                    reactCourses.forEach(course => {
                        console.log(`   - ${course.title}`);
                        console.log(`     ID: ${course._id}`);
                    });
                }
            }
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
            console.log('   Verified:', student.isVerified ? 'Yes' : 'No');
            console.log('   Created:', student.createdAt ? new Date(student.createdAt).toLocaleDateString() : 'N/A');
            console.log('   ID:', student._id);
            
            if (student.profile) {
                console.log('\n   Profile:');
                if (student.profile.universityName) console.log('   - University:', student.profile.universityName);
                if (student.profile.phone) console.log('   - Phone:', student.profile.phone);
                if (student.profile.address) console.log('   - Address:', student.profile.address);
            }
            
            // Check enrolled courses
            if (student.enrolledCourses && student.enrolledCourses.length > 0) {
                console.log(`\n   Enrolled Courses: ${student.enrolledCourses.length}`);
                for (const courseId of student.enrolledCourses) {
                    const course = await Course.findById(courseId);
                    if (course) {
                        console.log(`   - ${course.title}`);
                    }
                }
            } else {
                console.log('\n   Enrolled Courses: None');
            }
        } else {
            console.log('\n❌ Student with email rinsnac44@gmail.com not found');
        }
        
        console.log('\n' + '='.repeat(80));
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

findSpecificData();
