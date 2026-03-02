const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/userModel');

dotenv.config({ path: path.join(__dirname, '.env') });

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const studentsWithUni = await User.find({ universityId: { $ne: null }, role: 'student' }).populate('universityId', 'name');
        console.log(`Found ${studentsWithUni.length} students with a university link.`);

        studentsWithUni.forEach(s => {
            console.log(`- Student: ${s.email} linked to Univ: ${s.universityId?.name} (${s.universityId?._id})`);
        });

        const allStudents = await User.find({ role: 'student' });
        console.log(`Total students in DB: ${allStudents.length}`);

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
};

check();
