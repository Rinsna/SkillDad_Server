const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/userModel');
const Course = require('../models/courseModel');
const Enrollment = require('../models/enrollmentModel');

async function setupUniversityStudent() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const uniEmail = 'gmail+Uni@gmail.com';

        // 1. Find or create University Account
        let university = await User.findOne({ email: uniEmail });
        if (!university) {
            university = await User.create({
                name: 'Global University',
                email: uniEmail,
                password: 'Password123!', // Note: userModel has pre-save hook for hashing
                role: 'university',
                profile: {
                    universityName: 'Global International University',
                    location: 'Mumbai, India',
                    phone: '9988776655',
                    contactPerson: 'Admissions Office'
                },
                isVerified: true
            });
            console.log('Created University Account:', uniEmail);
        } else {
            console.log('Found Existing University Account:', uniEmail);
        }

        // 2. Find a Course to enroll in
        const course = await Course.findOne();
        if (!course) {
            console.error('No courses found. Please add a course via the admin panel first.');
            process.exit(1);
        }
        console.log('Course for enrollment:', course.title);

        // 3. Create a unique student for this university
        const studentEmail = `student_uni_${Date.now()}@gmail.com`;
        const student = await User.create({
            name: 'University Student ' + (Math.floor(Math.random() * 100)),
            email: studentEmail,
            password: 'StudentPassword789',
            role: 'student',
            universityId: university._id, // Link to this specific university
            profile: {
                studentId: 'UNI-' + Date.now().toString().slice(-6),
                phone: '9123456780'
            },
            isVerified: true
        });
        console.log('Created Student Account:', studentEmail, '(Linked to University)');

        // 4. Create Enrollment
        const enrollment = await Enrollment.create({
            student: student._id,
            course: course._id,
            status: 'active',
            enrollmentDate: new Date()
        });

        console.log('\nEnrollment successful!');
        console.log('--------------------');
        console.log('Student:', student.name);
        console.log('Email:', student.email);
        console.log('University:', university.profile.universityName);
        console.log('Course:', course.title);
        console.log('--------------------');

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

setupUniversityStudent();
