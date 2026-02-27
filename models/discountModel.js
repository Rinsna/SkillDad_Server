const mongoose = require('mongoose');

const discountSchema = mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
    },
    type: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage',
        required: true
    },
    value: {
        type: Number,
        required: true,
        min: 0,
    },
    partner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    usedCount: {
        type: Number,
        default: 0,
    },
    expiryDate: {
        type: Date,
        required: false,
    }
}, {
    timestamps: true,
});

const Discount = mongoose.model('Discount', discountSchema);

module.exports = Discount;
