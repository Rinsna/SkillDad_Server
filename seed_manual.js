const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const User = require('./models/userModel');
const Course = require('./models/courseModel');
const Payment = require('./models/paymentModel');

async function findAndCreatePayments() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const studentNames = ['Rinsna', 'Archana'];
        const users = await User.find({
            name: { $regex: studentNames.join('|'), $options: 'i' },
            role: 'student'
        });

        const course = await Course.findOne({
            title: { $regex: 'React', $options: 'i' }
        });

        if (!course) {
            console.error('React course not found');
            process.exit(1);
        }

        console.log(`Found ${users.length} students and course: ${course.title}`);

        for (const user of users) {
            const existingPayment = await Payment.findOne({
                student: user._id,
                course: course._id
            });

            if (!existingPayment) {
                const partner = user.registeredBy || user.universityId;
                let center = 'Direct';
                if (user.universityId) {
                    const uni = await User.findById(user.universityId);
                    center = uni?.profile?.universityName || uni?.name || 'University';
                } else if (user.registeredBy) {
                    const partnerUser = await User.findById(user.registeredBy);
                    center = partnerUser?.profile?.partnerName || partnerUser?.name || 'Partner';
                }

                const transactionId = `MAN-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

                await Payment.create({
                    student: user._id,
                    course: course._id,
                    amount: course.price || 499,
                    paymentMethod: 'bank_transfer',
                    status: 'approved',
                    screenshotUrl: 'uploads/payments/demo-receipt.png',
                    notes: 'System updated purchase for React course',
                    partner: partner,
                    center: center,
                    transactionId: transactionId,
                    reviewedBy: null,
                    reviewedAt: Date.now()
                });
                console.log(`Created payment for ${user.name}`);
            } else {
                console.log(`Payment already exists for ${user.name}`);
            }
        }

        console.log('Seeding completed.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findAndCreatePayments();
