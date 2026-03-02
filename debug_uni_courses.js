const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/userModel');
const Course = require('./models/courseModel');

dotenv.config({ path: path.join(__dirname, '.env') });

const checkMappings = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const universities = await User.find({ role: 'university' });
        console.log(`Found ${universities.length} universities.`);

        for (const uni of universities) {
            const assignedCount = uni.assignedCourses ? uni.assignedCourses.length : 0;
            const instructorCount = await Course.countDocuments({ instructor: uni._id });
            console.log(`Uni: ${uni.name} (${uni._id})`);
            console.log(`  - assignedCourses field count: ${assignedCount}`);
            console.log(`  - instructor field count in Course model: ${instructorCount}`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        mongoose.connection.close();
    }
};

checkMappings();
