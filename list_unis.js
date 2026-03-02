const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/userModel');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const users = await User.find({ role: 'university' });
        console.log('---UNIVERSITIES---');
        users.forEach(u => {
            console.log(`Name: ${u.name}, Email: ${u.email}, ID: ${u._id}`);
        });
        console.log('---END---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
