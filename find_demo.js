const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/userModel');
const Course = require('./models/courseModel');

dotenv.config({ path: path.join(__dirname, '.env') });

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const demoUsers = await User.find({ $or: [{ name: /demo/i }, { email: /demo/i }] });
        console.log('Demo Users:', JSON.stringify(demoUsers.map(u => ({ id: u._id, name: u.name, email: u.email })), null, 2));

        const demoCourses = await Course.find({ $or: [{ title: /demo/i }, { description: /demo/i }] });
        console.log('Demo Courses:', JSON.stringify(demoCourses.map(c => ({ id: c._id, title: c.title })), null, 2));

        await mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
    }
};

check();
