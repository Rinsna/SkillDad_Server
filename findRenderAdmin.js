// Script to test login with multiple passwords against the Render server
require('dotenv').config();
const https = require('https');

const passwords = ['admin123', 'Admin@123', 'Admin@skilldad1', 'password', 'admin@skilldad', 'SkillDad@123'];

async function testLogin(password) {
    return new Promise((resolve) => {
        const data = JSON.stringify({ email: 'admin@skilldad.com', password });
        const req = https.request({
            hostname: 'skilldad-server.onrender.com',
            path: '/api/users/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
        }, res => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve({ status: res.statusCode, body: body.substring(0, 300) }));
        });
        req.on('error', e => resolve({ status: 'ERR', body: e.message }));
        req.write(data);
        req.end();
    });
}

async function run() {
    for (const pw of passwords) {
        const result = await testLogin(pw);
        console.log(`Password "${pw}": STATUS ${result.status}`);
        if (result.status === 200) {
            console.log('  -> FOUND! Body:', result.body.substring(0, 100));
            break;
        }
    }
    process.exit();
}

run();
