const mongoose = require('mongoose');

const supportSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false, // Allow guest submissions? Or only logged in. User requested "handle by admin" from support page.
    },
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
    },
    subject: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
        default: 'Open',
    },
    adminResponse: {
        type: String,
    }
}, {
    timestamps: true,
});

module.exports = mongoose.model('Support', supportSchema);
