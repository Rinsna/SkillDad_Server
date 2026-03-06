const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/userModel');

const testLogin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const user = await User.findOne({ email: 'admin@skilldad.com' });
        if (!user) {
            console.log('User not found');
            process.exit(1);
        }

        const isMatch = await bcrypt.compare('123456', user.password);
        console.log('Password match for 123456:', isMatch);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

testLogin();
