const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/userModel');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const unis = await User.find({ role: 'university' }).select('name profile');
        console.log('---BEGIN---');
        console.log(JSON.stringify(unis, null, 2));
        console.log('---END---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
