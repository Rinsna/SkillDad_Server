const axios = require('axios');

async function debug() {
    try {
        console.log('Login...');
        const loginRes = await axios.post('https://skilldad-server.onrender.com/api/users/login', {
            email: 'sara.wilson@university.com',
            password: '123456'
        });
        const token = loginRes.data.token;
        console.log('Fetching courses...');
        const res = await axios.get('https://skilldad-server.onrender.com/api/courses/admin', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Count:', res.data.length);
        console.log('Data:', JSON.stringify(res.data.map(c => ({ id: c._id, title: c.title })), null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }
}
debug();
