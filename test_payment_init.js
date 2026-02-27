const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const testInitiate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const User = require('./models/userModel');
        const user = await User.findOne({ role: 'student' }) || await User.findOne();
        if (!user) {
            console.log('No user found');
            process.exit();
        }

        const Course = require('./models/courseModel');
        const course = await Course.findOne();
        if (!course) {
            console.log('No course found');
            process.exit();
        }

        const studentId = user._id;
        const courseId = course._id;
        const token = jwt.sign({ id: studentId, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

        console.log('Initiating payment...');
        const res = await axios.post('http://127.0.0.1:3030/api/payment/initiate', {
            courseId
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Success:', res.data);
    } catch (err) {
        console.log('Error Status:', err.response?.status);
        console.log('Error Data:', JSON.stringify(err.response?.data, null, 2));
    }
    process.exit();
};

testInitiate();
