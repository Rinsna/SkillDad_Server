const mongoose = require('mongoose');

// Exercise progress sub-schema
const exerciseProgressSchema = mongoose.Schema({
    content: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InteractiveContent',
        required: true
    },
    attempts: {
        type: Number,
        required: true,
        min: 1
    },
    bestScore: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    lastAttemptAt: {
        type: Date,
        required: true
    },
    isCompleted: {
        type: Boolean,
        default: false
    }
});

// Quiz progress sub-schema
const quizProgressSchema = mongoose.Schema({
    content: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InteractiveContent',
        required: true
    },
    attempts: {
        type: Number,
        required: true,
        min: 1
    },
    bestScore: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    isPassing: {
        type: Boolean,
        default: false
    },
    lastAttemptAt: {
        type: Date,
        required: true
    }
});

const progressSchema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    completedVideos: [{ type: mongoose.Schema.Types.ObjectId }], // IDs of videos watched
    completedExercises: [exerciseProgressSchema], // Updated to use new schema
    completedPractices: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InteractiveContent'
    }], // IDs of completed practice problems
    completedQuizzes: [quizProgressSchema], // Quiz progress with scores
    projectSubmissions: [{
        project: mongoose.Schema.Types.ObjectId,
        fileUrl: String,
        grade: String,
        feedback: String,
    }],
    isCompleted: { type: Boolean, default: false },
}, {
    timestamps: true,
});

const Progress = mongoose.model('Progress', progressSchema);

module.exports = Progress;
