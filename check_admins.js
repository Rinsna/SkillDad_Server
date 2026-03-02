const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/userModel');

dotenv.config({ path: path.join(__dirname, '.env') });

const checkAdminUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const admins = await User.find({ role: 'admin' });
        console.log('Admin users count:', admins.length);
        admins.forEach(admin => {
            console.log(`- ${admin.name} (${admin.email}), Role: ${admin.role}`);
        });

        const allRoles = await User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);
        console.log('Role distribution:', allRoles);

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkAdminUsers();
