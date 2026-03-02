const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/userModel');

dotenv.config({ path: path.join(__dirname, '.env') });

const link = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const uniId = '69a12ab59b6ce070ae944654'; // Dr. Sarah Wilson

        // Link the first 5 students to this university
        const students = await User.find({ role: 'student' }).limit(5);
        for (const student of students) {
            student.universityId = uniId;
            await student.save();
            console.log(`Linked ${student.email} to Dr. Sarah Wilson`);
        }

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
};

link();
