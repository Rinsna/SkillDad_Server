require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const User = require('./models/userModel');

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('Admin@skilldad1', salt);

    await User.updateOne({ role: 'admin' }, { $set: { password: hash } });

    const admin = await User.findOne({ role: 'admin' }).select('+password');
    const match = await bcrypt.compare('Admin@skilldad1', admin.password);
    console.log('Password set. Match verified:', match);
    console.log('Admin email:', admin.email);
    process.exit();
}).catch(e => { console.log('Error:', e.message); process.exit(1); });
