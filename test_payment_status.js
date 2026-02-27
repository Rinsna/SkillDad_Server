const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const testStatus = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const User = require('./models/userModel');
        const user = await User.findOne({ role: 'student' }) || await User.findOne();
        if (!user) {
            console.log('No user found');
            process.exit();
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

        console.log('Checking status with valid user...');
        const res = await axios.get(`http://127.0.0.1:3030/api/payment/status/TXN_wronglen_1`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Success!', res.status);
    } catch (err) {
        console.log('Error Status:', err.response?.status);
        console.log('Error Data:', JSON.stringify(err.response?.data, null, 2));
    }
    process.exit();
};

testStatus();
