const mongoose = require('mongoose');

const paymentSchema = mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        course: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Course',
        },
        enrollment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Enrollment',
        },
        amount: {
            type: Number,
            required: true,
        },
        paymentMethod: {
            type: String,
            enum: ['bank_transfer', 'credit_card', 'paypal', 'cryptocurrency', 'cash', 'other'],
            default: 'bank_transfer',
        },
        transactionId: {
            type: String,
        },
        screenshotUrl: {
            type: String,
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
        partner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        center: {
            type: String,
        },
        notes: {
            type: String,
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        reviewedAt: {
            type: Date,
        },
        paymentDate: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Payment', paymentSchema);
