require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const axios = require('axios');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const User = require('./models/userModel');

    // Check current state
    const admin = await User.findOne({ role: 'admin' }).select('+password');
    const match = await bcrypt.compare('Admin@skilldad1', admin.password);
    console.log('VERIFY: password match =', match, ', email =', admin.email);

    if (!match) {
        console.log('Fixing password...');
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('Admin@skilldad1', salt);
        await User.collection.updateOne({ role: 'admin' }, { $set: { password: hash } });
        const match2 = await bcrypt.compare('Admin@skilldad1', hash);
        console.log('After fix, match =', match2);
    }

    mongoose.disconnect();

    // Now test invite API
    console.log('\nTesting invite API...');
    try {
        const loginRes = await axios.post('http://localhost:3030/api/users/login', {
            email: admin.email,
            password: 'Admin@skilldad1'
        }, { timeout: 10000 });
        console.log('Login result:', loginRes.data.role, loginRes.data.name);

        const invRes = await axios.post('http://localhost:3030/api/admin/users/invite', {
            name: 'Test University X',
            email: 'test_univ_' + Date.now() + '@skilldad.com',
            password: 'Welcome@123',
            role: 'university'
        }, {
            headers: { Authorization: 'Bearer ' + loginRes.data.token },
            timeout: 30000
        });
        console.log('INVITE SUCCESS:', invRes.data.message);
    } catch (e) {
        console.log('API Error:', e.response?.status, JSON.stringify(e.response?.data) || e.message);
    }
    process.exit(0);
}

run().catch(e => { console.log('Fatal:', e.message); process.exit(1); });
