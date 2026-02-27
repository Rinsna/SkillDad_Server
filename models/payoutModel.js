const mongoose = require('mongoose');

const payoutSchema = mongoose.Schema({
    partner: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User',
    },
    amount: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    requestDate: {
        type: Date,
        default: Date.now,
    },
    payoutDate: {
        type: Date,
    },
    notes: {
        type: String,
    },
    screenshotUrl: {
        type: String, // URL/Path to proof of payment
    }
}, {
    timestamps: true,
});

const Payout = mongoose.model('Payout', payoutSchema);

module.exports = Payout;
