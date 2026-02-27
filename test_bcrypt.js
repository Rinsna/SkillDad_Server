const bcrypt = require('bcryptjs');

const testBcrypt = async () => {
    try {
        const password = '123456';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        console.log('Hash generated:', hash);
        const match = await bcrypt.compare(password, hash);
        console.log('Match result:', match);
        process.exit(0);
    } catch (err) {
        console.error('Bcrypt test failed:', err);
        process.exit(1);
    }
};

testBcrypt();
