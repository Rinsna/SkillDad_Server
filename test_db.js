const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const testConn = async () => {
    console.log('Testing MongoDB connection to:', process.env.MONGO_URI);
    try {
        const start = Date.now();
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log('Connected successfully in', Date.now() - start, 'ms');
        process.exit(0);
    } catch (err) {
        console.error('Connection failed:', err.message);
        process.exit(1);
    }
};

testConn();
