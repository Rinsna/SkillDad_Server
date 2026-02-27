const jwt = require('jsonwebtoken');

const testJwt = () => {
    try {
        const secret = 'skilldad_secret_key_123';
        const payload = { id: '123' };
        const token = jwt.sign(payload, secret, { expiresIn: '1h' });
        console.log('Token generated:', token);
        const decoded = jwt.verify(token, secret);
        console.log('Decoded:', decoded);
        process.exit(0);
    } catch (err) {
        console.error('JWT test failed:', err);
        process.exit(1);
    }
};

testJwt();
