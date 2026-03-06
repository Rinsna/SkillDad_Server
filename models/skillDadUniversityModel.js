const mongoose = require('mongoose');

const skillDadUniversitySchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    location: {
        type: String,
        default: '',
    },
    website: {
        type: String,
        default: '',
    },
    phone: {
        type: String,
        default: '',
    },
    email: {
        type: String,
        default: '',
    },
    description: {
        type: String,
        default: '',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

const SkillDadUniversity = mongoose.model('SkillDadUniversity', skillDadUniversitySchema);

module.exports = SkillDadUniversity;
