const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Course = require('../models/courseModel');

async function list() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const courses = await Course.find({});
        console.log(courses.map(c => ({ id: c._id, title: c.title, price: c.price })));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
list();
