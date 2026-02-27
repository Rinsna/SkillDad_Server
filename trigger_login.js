const axios = require('axios');

const triggerLogin = async () => {
    try {
        const res = await axios.post('http://127.0.0.1:3030/api/users/login', {
            email: 'john.smith@student.com',
            password: '123456'
        });
        console.log('Login success:', res.data);
    } catch (err) {
        console.log('Login failed:', err.response?.status, err.response?.data);
    }
};

triggerLogin();
