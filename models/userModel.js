const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['student', 'university', 'partner', 'admin', 'finance'],
        default: 'student',
    },
    bio: {
        type: String,
        default: '',
    },
    profileImage: {
        type: String,
        default: '',
    },
    profile: {
        // Additional fields based on role
        universityName: String,
        partnerName: String,
        studentId: String,
        website: String,
        location: String,
        phone: String,
        contactPerson: String,
    },
    universityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Links to the University User
    },
    partnerCode: {
        type: String, // Code used for B2B referral
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    discountRate: {
        type: Number,
        default: 0, // Percentage discount for this partner/university
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
}, {
    timestamps: true,
});

userSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }
    // 8 rounds = 256 iterations, still very secure and 4x faster than 10 rounds
    this.password = await bcrypt.hash(this.password, 8);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    if (!this.password) {
        console.error('Core Security Error: User found but password field is missing in document');
        return false;
    }
    return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password token
userSchema.methods.getResetPasswordToken = function () {
    // Generate token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Set expire
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    return resetToken;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
