const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/userModel');
const Course = require('../models/courseModel');
const Enrollment = require('../models/enrollmentModel');

async function addSpecificStudent() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const uniEmail = 'Uni@gmail.com';
        const studentEmail = 'john.smith@student.com';

        // 1. Find or create University Account
        let university = await User.findOne({ email: uniEmail });
        if (!university) {
            // Check if perhaps they meant gmail+Uni@gmail.com from earlier
            university = await User.findOne({ email: 'gmail+Uni@gmail.com' });
            if (university) {
                console.log('Found existing university account with alternative email: gmail+Uni@gmail.com. Updating it to Uni@gmail.com or using it.');
                // I'll just use this one but update the email if needed or just use it as the target.
                // Actually the user asked for Uni@gmail.com, so let's ensure one exists with that email.
            }

            if (!university || university.email !== uniEmail) {
                university = await User.create({
                    name: 'Skill Dad Partner University',
                    email: uniEmail,
                    password: 'Password123!',
                    role: 'university',
                    profile: {
                        universityName: 'Skill Dad University',
                        location: 'Global',
                        phone: '1234567890'
                    },
                    isVerified: true
                });
                console.log('Created University Account:', uniEmail);
            }
        } else {
            console.log('Found Existing University Account:', uniEmail);
        }

        // 2. Find or create Student Account
        let student = await User.findOne({ email: studentEmail });
        if (!student) {
            student = await User.create({
                name: 'John Smith',
                email: studentEmail,
                password: 'StudentPassword123',
                role: 'student',
                universityId: university._id,
                profile: {
                    studentId: 'JS-' + Math.floor(1000 + Math.random() * 9000),
                    phone: '9998887776'
                },
                isVerified: true
            });
            console.log('Created Student Account:', studentEmail);
        } else {
            // Ensure student is linked to the university
            student.universityId = university._id;
            await student.save();
            console.log('Student Account found and linked to university:', studentEmail);
        }

        // 3. Enroll in a course
        const course = await Course.findOne();
        if (!course) {
            console.error('No courses found to enroll in.');
            process.exit(1);
        }

        // Check for existing enrollment
        const existingEnroll = await Enrollment.findOne({ student: student._id, course: course._id });
        if (!existingEnroll) {
            await Enrollment.create({
                student: student._id,
                course: course._id,
                status: 'active'
            });
            console.log(`Enrolled ${student.name} in ${course.title}`);
        } else {
            console.log('Student is already enrolled in this course.');
        }

        console.log('\nSuccess!');
        console.log('University:', university.email);
        console.log('Student:', student.name, `(${student.email})`);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

addSpecificStudent();
