const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });
const User = require('./models/userModel');

async function testUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const emails = ['student@test.com', 'university@test.com', 'admin@skilldad.com'];
        const users = await User.find({ email: { $in: emails } });

        console.log('--- USER PASSWORD CHECK ---');
        for (const email of emails) {
            const user = users.find(u => u.email === email);
            if (!user) {
                console.log(`${email}: NOT FOUND`);
                continue;
            }
            const match = await bcrypt.compare('123456', user.password);
            console.log(`${email} (${user.role}): ${match ? 'MATCH (123456)' : 'FAIL'}`);
        }

        // Find all other users
        const others = await User.find({ email: { $nin: emails } });
        if (others.length > 0) {
            console.log('\n--- OTHER USERS ---');
            for (const u of others) {
                const match = await bcrypt.compare('123456', u.password);
                console.log(`${u.email} (${u.role}): ${match ? 'MATCH (123456)' : 'FAIL'}`);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
testUsers();
