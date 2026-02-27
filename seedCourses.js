const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Course = require('./models/courseModel');
const User = require('./models/userModel');

dotenv.config();

const seedCourses = async () => {
    try {
        await mongoose.connect(process.env.DATABASE_URI || process.env.MONGO_URI);

        // Find an admin or university user to act as instructor
        let instructor = await User.findOne({ role: { $in: ['admin', 'university'] } });
        let instructorId = instructor ? instructor._id : new mongoose.Types.ObjectId();

        const courses = [
            {
                title: 'Full-Stack Next.js Mastery',
                description: 'Build enterprise-grade applications with Next.js 14, React, TailwindCSS, and Prisma.',
                category: 'Web Development',
                price: 199.99,
                thumbnail: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?q=80&w=800&auto=format&fit=crop',
                isPublished: true,
                instructorName: 'Sarah Jenkins',
                universityName: 'Global Tech Institute',
                instructor: instructorId,
                modules: [
                    {
                        title: 'Getting Started with Next.js',
                        videos: [
                            { title: 'Introduction to Next.js', url: 'https://www.youtube.com/embed/tjzZhtEXN3c', duration: "15:00", videoType: 'external' }
                        ]
                    }
                ]
            }
        ];

        console.log('Inserting generated courses...');
        for (let c of courses) {
            try {
                await Course.create(c);
                console.log('Created: ' + c.title);
            } catch (e) {
                console.log('Failed to create: ' + c.title);
                console.log(e.message);
                if (e.errors) {
                    for (let key in e.errors) {
                        console.log("Field: " + key + ", Error: " + e.errors[key].message);
                    }
                }
            }
        }

        console.log('Seed completed successfully!');
        process.exit();
    } catch (error) {
        console.error('Error seeding courses:', error);
        process.exit(1);
    }
};

seedCourses();
