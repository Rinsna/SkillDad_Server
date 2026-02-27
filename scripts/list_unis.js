const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/userModel');

async function list() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const unis = await User.find({ role: 'university' });
        console.log('Universities:', unis.map(u => ({ id: u._id, name: u.name, uniName: u.profile?.universityName })));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
list();
