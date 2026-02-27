const mongoose = require('mongoose');
const User = require('./models/userModel');
const dotenv = require('dotenv');

dotenv.config();

const checkUser = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const user = await User.findOne({ email: 'finance@skilldad.com' });
        if (user) {
            console.log('User found:', {
                email: user.email,
                role: user.role,
                isVerified: user.isVerified
            });
        } else {
            console.log('User finance@skilldad.com not found');
        }
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

checkUser();
