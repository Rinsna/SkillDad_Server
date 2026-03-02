const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Course = require('./models/courseModel');

dotenv.config({ path: path.join(__dirname, '.env') });

const update = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const result = await Course.updateMany(
            {
                $or: [
                    { title: /Research/i },
                    { title: /Clinical/i },
                    { title: /Biostatistics/i },
                    { title: /Genetics/i },
                    { title: /Healthcare/i }
                ],
                instructor: { $in: [null, undefined] }
            },
            { $set: { instructor: '69a12ab59b6ce070ae944654' } }
        );
        console.log(`Updated ${result.modifiedCount} courses to Dr. Sarah Wilson.`);
        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
};

update();
