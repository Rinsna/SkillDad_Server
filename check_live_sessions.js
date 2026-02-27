const mongoose = require('mongoose');
const LiveSession = require('./models/liveSessionModel');
require('dotenv').config();

async function checkSessions() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const sessions = await LiveSession.find({ isDeleted: false }, 'topic status bunny scheduledStartTime startTime').lean();
        console.log('---BEGIN SESSIONS---');
        console.log(JSON.stringify(sessions, null, 2));
        console.log('---END SESSIONS---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkSessions();
