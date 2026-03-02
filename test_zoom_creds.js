const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ZOOM_API_KEY = process.env.ZOOM_API_KEY;
const ZOOM_API_SECRET = process.env.ZOOM_API_SECRET;
const ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;

async function testZoomCredentials() {
    console.log('Testing Zoom Credentials...');
    console.log('API KEY:', ZOOM_API_KEY ? 'Present' : 'Missing');
    console.log('API SECRET:', ZOOM_API_SECRET ? 'Present' : 'Missing');
    console.log('ACCOUNT ID:', ZOOM_ACCOUNT_ID ? 'Present' : 'Missing');

    if (!ZOOM_API_KEY || !ZOOM_API_SECRET || !ZOOM_ACCOUNT_ID) {
        console.error('❌ Missing credentials in .env');
        return;
    }

    try {
        const tokenUrl = 'https://zoom.us/oauth/token';
        const params = new URLSearchParams();
        params.append('grant_type', 'account_credentials');
        params.append('account_id', ZOOM_ACCOUNT_ID.trim());

        const response = await axios.post(tokenUrl, params.toString(), {
            headers: {
                'Authorization': `Basic ${Buffer.from(`${ZOOM_API_KEY.trim()}:${ZOOM_API_SECRET.trim()}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('✅ Success! Access Token generated.');
        // console.log('Token:', response.data.access_token);

        // Test meeting creation capability
        const accessToken = response.data.access_token;
        console.log('Testing meeting creation permission...');

        try {
            const userRes = await axios.get('https://api.zoom.us/v2/users/me', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            console.log('✅ Successfully fetched user info:', userRes.data.email);
        } catch (err) {
            console.error('❌ Failed to fetch user info:', err.response?.data || err.message);
        }

    } catch (error) {
        console.error('❌ Authentication Failed!');
        console.error('Status:', error.response?.status);
        console.error('Data:', JSON.stringify(error.response?.data, null, 2));
        console.error('Message:', error.message);
    }
}

testZoomCredentials();
