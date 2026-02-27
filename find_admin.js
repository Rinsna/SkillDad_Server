const mongoose = require('mongoose');
const User = require('./models/userModel');
require('dotenv').config();

async function findAdmin() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const admin = await User.findOne({ role: 'admin' }).select('email');
        console.log('---BEGIN---');
        console.log(JSON.stringify(admin, null, 2));
        console.log('---END---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
findAdmin();
