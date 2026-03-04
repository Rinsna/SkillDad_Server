const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

dotenv.config({ path: path.join(__dirname, '.env') });

const LiveSession = require('./models/liveSessionModel');

const ZOOM_ENCRYPTION_KEY = process.env.ZOOM_ENCRYPTION_KEY;
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

async function checkSession() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const sessionId = '69a5210a9e8cf4c63f77546c';
        const session = await LiveSession.findById(sessionId).lean();

        if (!session) {
            console.log('Session not found');
            return;
        }

        console.log('Session Topic:', session.topic);
        console.log('Zoom Data:', JSON.stringify(session.zoom, null, 2));

        if (session.zoom && session.zoom.passcode) {
            const passcode = session.zoom.passcode;
            console.log('Passcode in DB:', passcode);

            const parts = passcode.split(':');
            console.log('Parts length:', parts.length);

            if (parts.length === 2) {
                try {
                    const iv = Buffer.from(parts[0], 'hex');
                    const encryptedData = parts[1];
                    const key = crypto.createHash('sha256').update(ZOOM_ENCRYPTION_KEY).digest();
                    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
                    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
                    decrypted += decipher.final('utf8');
                    console.log('Decryption SUCCESS:', decrypted);
                } catch (e) {
                    console.log('Decryption FAILED:', e.message);
                }
            } else {
                console.log('Passcode is NOT in iv:encryptedData format');
            }
        }

        mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
}

checkSession();
