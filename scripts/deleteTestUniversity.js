const mongoose = require('mongoose');
const User = require('../models/userModel');
require('dotenv').config({ path: '../.env' });

const deleteTestUniversity = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find the user first
        const user = await User.findOne({ email: 'university@test.com' });
        
        if (!user) {
            console.log('User with email university@test.com not found');
            process.exit(0);
        }

        console.log('Found user:', {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        });

        // Delete the user
        await User.deleteOne({ email: 'university@test.com' });
        console.log('✅ Successfully deleted user: university@test.com');

        // Verify deletion
        const checkUser = await User.findOne({ email: 'university@test.com' });
        if (!checkUser) {
            console.log('✅ Verified: User has been removed from database');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error deleting user:', error);
        process.exit(1);
    }
};

deleteTestUniversity();
