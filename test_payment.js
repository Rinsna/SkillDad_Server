const mongoose = require('mongoose');
const User = require('./models/userModel');
const Course = require('./models/courseModel');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    const student = await User.findOne({ role: 'student' });
    const course = await Course.findOne({});
    const token = jwt.sign({ id: student._id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });

    const csrfRes = await axios.get('http://localhost:3030/api/payment/csrf-token', {
        headers: { Authorization: `Bearer ${token}` }
    });

    const cookie = csrfRes.headers['set-cookie'];

    try {
        const initRes = await axios.post('http://localhost:3030/api/payment/initiate', {
            courseId: course._id.toString(),
            mode: 'elements'
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
                'X-CSRF-Token': csrfRes.data.csrfToken,
                Cookie: cookie ? cookie.join('; ') : ''
            }
        });

        console.log("SUCCESS:", initRes.data);
    } catch (e) {
        if (e.response) {
            console.log("HTTTP ERROR", e.response.status, e.response.data);
        } else {
            console.log("ERROR", e.message);
        }
    }

    process.exit(0);
}
test();
