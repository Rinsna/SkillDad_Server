require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const User = require('./models/userModel');

    // Find users matching 'anu' or 'diya' (case-insensitive name search)
    const usersToDelete = await User.find({
        name: { $regex: /anu|diya/i }
    }).select('name email role');

    if (usersToDelete.length === 0) {
        console.log('No users found matching "anu" or "diya".');
        process.exit();
    }

    console.log('Found users to delete:');
    usersToDelete.forEach(u => console.log(` - ${u.name} | ${u.email} | ${u.role}`));

    // Delete them
    const ids = usersToDelete.map(u => u._id);
    const result = await User.deleteMany({ _id: { $in: ids } });
    console.log(`\nDeleted ${result.deletedCount} user(s) successfully.`);

    process.exit();
}).catch(e => { console.log('Error:', e.message); process.exit(1); });
