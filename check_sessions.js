const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const LiveSession = require('./models/liveSessionModel');

async function checkSessions() {
    try {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!uri) {
            console.error('MONGO_URI is not defined in .env');
            return;
        }
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const sessions = await LiveSession.find().sort({ createdAt: -1 }).limit(10);

        console.log('\n--- LAST 10 SESSIONS ---');
        sessions.forEach(s => {
            console.log(`\nTopic: ${s.topic}`);
            console.log(`Original startTime (DB): ${s.startTime ? s.startTime.toISOString() : 'MISSING'}`);
            console.log(`Reported Timezone: ${s.timezone}`);
            console.log(`Created At: ${s.createdAt.toISOString()}`);
        });

        await mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
}

checkSessions();
