const mongoose = require('mongoose');

const partnerLogoSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    logo: {
        type: String,
        required: false
    },
    type: {
        type: String,
        enum: ['corporate', 'university'],
        default: 'corporate'
    },
    // For Universities
    location: {
        type: String,
        trim: true
    },
    students: {
        type: String, // e.g. "12K+"
        trim: true
    },
    programs: {
        type: String, // e.g. "45+"
        trim: true
    },
    order: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const PartnerLogo = mongoose.model('PartnerLogo', partnerLogoSchema);

module.exports = PartnerLogo;
