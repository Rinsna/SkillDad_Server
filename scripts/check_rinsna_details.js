const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/userModel');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const student = await User.findOne({ name: /Rinsna/i }).populate('universityId', 'name');
        console.log('Student Data:', JSON.stringify(student, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
