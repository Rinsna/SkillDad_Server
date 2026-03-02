const mongoose = require('mongoose');
const User = require('./models/userModel');
require('dotenv').config();

const checkUniversities = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Check all universities
        const allUniversities = await User.find({ role: 'university' })
            .select('name email profile isVerified')
            .sort({ 'profile.universityName': 1, name: 1 });

        console.log('\n=== ALL UNIVERSITIES ===');
        console.log('Total universities:', allUniversities.length);
        allUniversities.forEach(uni => {
            console.log(`\nID: ${uni._id}`);
            console.log(`Name: ${uni.name}`);
            console.log(`Email: ${uni.email}`);
            console.log(`University Name: ${uni.profile?.universityName || 'N/A'}`);
            console.log(`Verified: ${uni.isVerified}`);
        });

        // Check verified universities
        const verifiedUniversities = await User.find({ 
            role: 'university',
            isVerified: true 
        })
            .select('name email profile isVerified')
            .sort({ 'profile.universityName': 1, name: 1 });

        console.log('\n\n=== VERIFIED UNIVERSITIES ===');
        console.log('Total verified universities:', verifiedUniversities.length);
        verifiedUniversities.forEach(uni => {
            console.log(`\nID: ${uni._id}`);
            console.log(`Name: ${uni.name}`);
            console.log(`Email: ${uni.email}`);
            console.log(`University Name: ${uni.profile?.universityName || 'N/A'}`);
        });

        await mongoose.connection.close();
        console.log('\n\nDatabase connection closed');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

checkUniversities();
