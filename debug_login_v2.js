const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/userModel');

async function check() {
    try {
        console.log('Connecting to:', process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const email = 'admin@skilldad.com';
        const user = await User.findOne({ email });

        if (!user) {
            console.log('User NOT found:', email);
            const all = await User.find({}, 'email');
            console.log('All users:', all.map(u => u.email));
        } else {
            console.log('User found:', user.email);
            console.log('Role:', user.role);
            const match = await bcrypt.compare('123456', user.password);
            console.log('Password "123456" match:', match);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

check();
