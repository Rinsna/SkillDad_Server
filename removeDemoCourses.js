const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Course = require('./models/courseModel');

dotenv.config();

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI or DATABASE_URI not found in environment variables');
        }
        const conn = await mongoose.connect(mongoUri);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const demoCoursesTitles = [
    'Mastering Generative AI & LLMs',
    'Cybersecurity Red Team Essentials',
    'UX/UI Strategy: From Research to High Fidelity',
    'Cloud Architecture with AWS & Azure',
    'Blockchain & Smart Contract Audit'
];

const removeDemoCourses = async () => {
    try {
        await connectDB();

        console.log('🔍 Searching for demo courses...');
        
        // Find demo courses by title
        const demoCourses = await Course.find({
            title: { $in: demoCoursesTitles }
        });

        console.log(`Found ${demoCourses.length} demo courses:`);
        demoCourses.forEach(course => {
            console.log(`  - ${course.title} (ID: ${course._id})`);
        });

        if (demoCourses.length === 0) {
            console.log('✅ No demo courses found. Database is clean!');
            process.exit();
            return;
        }

        // Delete demo courses
        const result = await Course.deleteMany({
            title: { $in: demoCoursesTitles }
        });

        console.log(`\n✅ Successfully removed ${result.deletedCount} demo courses!`);
        process.exit();
    } catch (error) {
        console.error('❌ Error removing demo courses:', error);
        process.exit(1);
    }
};

removeDemoCourses();
