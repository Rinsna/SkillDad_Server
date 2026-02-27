const mongoose = require('mongoose');

const enrollmentSchema = mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true,
    },
    enrollmentDate: {
        type: Date,
        default: Date.now,
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'dropped', 'suspended'],
        default: 'active',
    },
    progress: {
        type: Number,
        default: 0, // Percentage completion
    },
    completedModules: {
        type: Number,
        default: 0,
    },
    totalModules: {
        type: Number,
        default: 0,
    },
    completedVideos: [{
        videoId: mongoose.Schema.Types.ObjectId,
        completedAt: Date,
    }],
    completedExercises: [{
        videoId: mongoose.Schema.Types.ObjectId,
        exerciseId: mongoose.Schema.Types.ObjectId,
        score: Number,
        completedAt: Date,
    }],
    grade: {
        type: String,
        enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'],
    },
    finalScore: {
        type: Number,
        min: 0,
        max: 100,
    },
    certificateIssued: {
        type: Boolean,
        default: false,
    },
    certificateUrl: String,
}, {
    timestamps: true,
});

// Compound index to prevent duplicate enrollments
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

module.exports = Enrollment;