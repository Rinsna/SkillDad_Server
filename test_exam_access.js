const http = require('http');

const loginData = JSON.stringify({ email: 'Uni@gmail.com', password: 'password123' });

const loginReq = http.request({
    hostname: '127.0.0.1',
    port: 3030,
    path: '/api/users/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
}, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
        const parsed = JSON.parse(body);
        if (!parsed.token) { console.log('Login failed:', body); process.exit(1); }
        console.log('Login OK. Role:', parsed.role, 'Email:', parsed.email);

        const examReq = http.request({
            hostname: '127.0.0.1',
            port: 3030,
            path: '/api/exams',
            method: 'GET',
            headers: { Authorization: `Bearer ${parsed.token}` }
        }, (r2) => {
            let b2 = '';
            r2.on('data', d => b2 += d);
            r2.on('end', () => {
                console.log('GET /api/exams Status:', r2.statusCode);
                if (r2.statusCode !== 200) console.log('Response:', b2.substring(0, 200));
                else console.log('SUCCESS - Exams returned:', JSON.parse(b2).length, 'records');
                process.exit(0);
            });
        });
        examReq.end();
    });
});
loginReq.write(loginData);
loginReq.end();
