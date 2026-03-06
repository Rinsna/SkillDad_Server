const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });
const User = require('./models/userModel');

async function resetAllPasswords() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const users = await User.find({});
        console.log(`Found ${users.length} users. Resetting passwords to "123456"...`);

        for (const user of users) {
            user.password = '123456';
            await user.save();
            console.log(`Reset: ${user.email} (${user.role})`);
        }

        console.log('--- ALL PASSWORDS RESET TO 123456 ---');
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
resetAllPasswords();
