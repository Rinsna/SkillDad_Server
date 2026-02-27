const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/userModel');
const Course = require('./models/courseModel');
const Enrollment = require('./models/enrollmentModel');
const Exam = require('./models/examModel');
const Project = require('./models/projectModel');
const Document = require('./models/documentModel');
const Payment = require('./models/paymentModel');
const Payout = require('./models/payoutModel');
const PartnerLogo = require('./models/partnerLogoModel');
const Progress = require('./models/progressModel');

dotenv.config();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const seedData = async () => {
    try {
        // Clear existing data
        await User.deleteMany({});
        await Course.deleteMany({});
        await Enrollment.deleteMany({});
        await Exam.deleteMany({});
        await Project.deleteMany({});
        await Document.deleteMany({});
        await Payment.deleteMany({});
        await Payout.deleteMany({});
        await PartnerLogo.deleteMany({});
        await Progress.deleteMany({});

        console.log('Cleared existing data');

        // Create Users
        const users = await User.create([
            {
                name: 'Admin User',
                email: 'admin@skilldad.com',
                password: '123456', // Let the model hash it
                role: 'admin',
                isVerified: true
            },
            {
                name: 'Dr. Sarah Wilson',
                email: 'sarah.wilson@university.edu',
                password: '123456', // Let the model hash it
                role: 'university',
                profile: {
                    universityName: 'Tech University'
                },
                isVerified: true
            },
            {
                name: 'John Smith',
                email: 'john.smith@student.com',
                password: '123456', // Let the model hash it
                role: 'student',
                profile: {
                    studentId: 'STU001'
                },
                isVerified: true
            },
            {
                name: 'Alice Johnson',
                email: 'alice.johnson@student.com',
                password: '123456', // Let the model hash it
                role: 'student',
                profile: {
                    studentId: 'STU002'
                },
                isVerified: true
            },
            {
                name: 'Bob Davis',
                email: 'bob.davis@student.com',
                password: '123456', // Let the model hash it
                role: 'student',
                profile: {
                    studentId: 'STU003'
                },
                isVerified: true
            },
            {
                name: 'TechCorp Partner',
                email: 'partner@techcorp.com',
                password: '123456', // Let the model hash it
                role: 'partner',
                profile: {
                    partnerName: 'TechCorp Solutions'
                },
                partnerCode: 'TECH001',
                discountRate: 15,
                isVerified: true
            },
            {
                name: 'Finance Manager',
                email: 'finance@skilldad.com',
                password: '123456', // Let the model hash it
                role: 'finance',
                isVerified: true
            }
        ]);

        console.log('Users created');

        // Create Courses
        const courses = await Course.create([
            {
                title: 'Complete React Development Bootcamp',
                description: 'Master React from fundamentals to advanced concepts including hooks, context, Redux, and modern development practices.',
                thumbnail: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800',
                category: 'Web Development',
                price: 199,
                instructor: users[1]._id, // Dr. Sarah Wilson
                modules: [
                    {
                        title: 'React Fundamentals',
                        videos: [
                            {
                                title: 'Introduction to React',
                                url: 'https://www.youtube.com/embed/dGcsHMXbSOA',
                                duration: '15:30',
                                exercises: [
                                    {
                                        question: 'What is React?',
                                        options: ['A JavaScript library', 'A database', 'A server', 'An operating system'],
                                        correctAnswer: 'A JavaScript library',
                                        type: 'mcq'
                                    }
                                ]
                            },
                            {
                                title: 'JSX and Components',
                                url: 'https://www.youtube.com/embed/DLX62G4lc44',
                                duration: '20:45',
                                exercises: [
                                    {
                                        question: 'What does JSX stand for?',
                                        options: ['JavaScript XML', 'Java Syntax Extension', 'JSON XML', 'JavaScript Extension'],
                                        correctAnswer: 'JavaScript XML',
                                        type: 'mcq'
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        title: 'State and Props',
                        videos: [
                            {
                                title: 'Understanding State',
                                url: 'https://www.youtube.com/embed/4pO-HcG2igk',
                                duration: '18:20',
                                exercises: [
                                    {
                                        question: 'What is state in React?',
                                        options: ['A way to store component data', 'A CSS property', 'A HTML attribute', 'A JavaScript function'],
                                        correctAnswer: 'A way to store component data',
                                        type: 'mcq'
                                    }
                                ]
                            }
                        ]
                    }
                ],
                projects: [
                    {
                        title: 'Build a Todo App',
                        description: 'Create a fully functional todo application using React hooks',
                        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
                    }
                ],
                isPublished: true
            },
            {
                title: 'Python for Data Science',
                description: 'Learn Python programming with focus on data analysis, visualization, and machine learning.',
                thumbnail: 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=800',
                category: 'Data Science',
                price: 249,
                instructor: users[1]._id,
                modules: [
                    {
                        title: 'Python Basics',
                        videos: [
                            {
                                title: 'Python Introduction',
                                url: 'https://www.youtube.com/embed/rfscVS0vtbw',
                                duration: '25:15',
                                exercises: [
                                    {
                                        question: 'What type of language is Python?',
                                        options: ['Interpreted', 'Compiled', 'Assembly', 'Machine'],
                                        correctAnswer: 'Interpreted',
                                        type: 'mcq'
                                    }
                                ]
                            }
                        ]
                    }
                ],
                isPublished: true
            },
            {
                title: 'Full Stack JavaScript Development',
                description: 'Complete full-stack development course covering Node.js, Express, MongoDB, and React.',
                thumbnail: 'https://images.unsplash.com/photo-1627398242454-45a1465c2479?w=800',
                category: 'Full Stack',
                price: 299,
                instructor: users[1]._id,
                modules: [
                    {
                        title: 'Backend Development',
                        videos: [
                            {
                                title: 'Node.js Fundamentals',
                                url: 'https://www.youtube.com/embed/TlB_eWDSMt4',
                                duration: '30:00',
                                exercises: [
                                    {
                                        question: 'What is Node.js?',
                                        options: ['JavaScript runtime', 'Database', 'Framework', 'Library'],
                                        correctAnswer: 'JavaScript runtime',
                                        type: 'mcq'
                                    }
                                ]
                            }
                        ]
                    }
                ],
                isPublished: true
            }
        ]);

        console.log('Courses created');

        // Create Enrollments
        const enrollments = await Enrollment.create([
            {
                student: users[2]._id, // John Smith
                course: courses[0]._id, // React Course
                progress: 75,
                completedModules: 1,
                totalModules: 2,
                status: 'active'
            },
            {
                student: users[2]._id, // John Smith
                course: courses[1]._id, // Python Course
                progress: 45,
                completedModules: 0,
                totalModules: 1,
                status: 'active'
            },
            {
                student: users[3]._id, // Alice Johnson
                course: courses[0]._id, // React Course
                progress: 90,
                completedModules: 2,
                totalModules: 2,
                status: 'active'
            },
            {
                student: users[4]._id, // Bob Davis
                course: courses[2]._id, // Full Stack Course
                progress: 30,
                completedModules: 0,
                totalModules: 1,
                status: 'active'
            }
        ]);

        console.log('Enrollments created');

        // Create Progress records (needed for Student Dashboard)
        const progressRecords = await Progress.create([
            {
                user: users[2]._id, // John Smith
                course: courses[0]._id, // React Course
                completedVideos: [courses[0].modules[0].videos[0]._id],
                isCompleted: false
            },
            {
                user: users[2]._id, // John Smith
                course: courses[1]._id, // Python Course
                completedVideos: [],
                isCompleted: false
            }
        ]);

        console.log('Progress records created');

        // Create Sample Payments
        const payments = await Payment.create([
            {
                student: users[2]._id, // John Smith
                course: courses[0]._id, // React Course
                amount: 199,
                status: 'pending',
                paymentMethod: 'bank_transfer',
                screenshotUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400',
                partner: users[5]._id, // TechCorp Partner
                center: 'Tech Hub Center',
                transactionId: 'TXN001'
            },
            {
                student: users[3]._id, // Alice Johnson
                course: courses[1]._id, // Python Course
                amount: 249,
                status: 'approved',
                paymentMethod: 'credit_card',
                screenshotUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400',
                partner: users[5]._id,
                center: 'Innovation Center',
                transactionId: 'TXN002'
            },
            {
                student: users[4]._id, // Bob Davis
                course: courses[2]._id, // Full Stack Course
                amount: 299,
                status: 'pending',
                paymentMethod: 'paypal',
                screenshotUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400',
                center: 'Digital Learning Hub',
                transactionId: 'TXN003'
            }
        ]);

        console.log('Payments created');

        // Create Sample Payouts
        const payouts = await Payout.create([
            {
                partner: users[5]._id, // TechCorp Partner
                amount: 500,
                status: 'pending',
                requestDate: new Date(),
                paymentMethod: 'bank_transfer'
            },
            {
                partner: users[5]._id,
                amount: 750,
                status: 'approved',
                requestDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
                payoutDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
                paymentMethod: 'bank_transfer',
                screenshotUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400'
            }
        ]);

        console.log('Payouts created');

        console.log('✅ Database seeded successfully!');
        console.log('\n📊 Sample Data Created:');
        console.log(`👥 Users: ${users.length}`);
        console.log(`📚 Courses: ${courses.length}`);
        console.log(`📝 Enrollments: ${enrollments.length}`);
        console.log(`💳 Payments: ${payments.length}`);
        console.log(`💰 Payouts: ${payouts.length}`);

        console.log('\n🔐 Login Credentials:');
        console.log('Admin: admin@skilldad.com / 123456');
        console.log('University: sarah.wilson@university.edu / 123456');
        console.log('Student: john.smith@student.com / 123456');
        console.log('Student: alice.johnson@student.com / 123456');
        console.log('Student: bob.davis@student.com / 123456');
        console.log('Partner: partner@techcorp.com / 123456');
        console.log('Finance: finance@skilldad.com / 123456');

        // Create Partner Logos
        const partnerLogos = await PartnerLogo.create([
            { name: 'Oxford Digital', order: 1, isActive: true },
            { name: 'MIT Horizon', order: 2, isActive: true },
            { name: 'Stanford Online', order: 3, isActive: true },
            { name: 'ETH Zurich', order: 4, isActive: true },
            { name: 'Berkeley Tech', order: 5, isActive: true },
            { name: 'Cambridge AI', order: 6, isActive: true },
            { name: 'Global Finance Core', order: 7, isActive: true },
            { name: 'TechNexus B2B', order: 8, isActive: true }
        ]);

        console.log(`Created ${partnerLogos.length} partner logos`);

    } catch (error) {
        console.error('Error seeding database:', error);
    }
};

const runSeeder = async () => {
    await connectDB();
    await seedData();
    process.exit(0);
};

runSeeder();