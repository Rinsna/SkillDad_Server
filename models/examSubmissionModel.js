const mongoose = require('mongoose');

const answerSchema = mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    answer: mongoose.Schema.Types.Mixed, // Can be string, array, or object
    isCorrect: Boolean,
    pointsEarned: {
        type: Number,
        default: 0,
    },
});

const examSubmissionSchema = mongoose.Schema({
    exam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exam',
        required: true,
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    answers: [answerSchema],
    startTime: {
        type: Date,
        required: true,
    },
    endTime: Date,
    timeSpent: Number, // Time spent in minutes
    score: {
        type: Number,
        default: 0,
    },
    percentage: {
        type: Number,
        default: 0,
    },
    passed: {
        type: Boolean,
        default: false,
    },
    attemptNumber: {
        type: Number,
        default: 1,
    },
    status: {
        type: String,
        enum: ['in-progress', 'submitted', 'graded', 'expired'],
        default: 'in-progress',
    },
    feedback: String,
    gradedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    gradedAt: Date,
}, {
    timestamps: true,
});

// Compound index for efficient queries
examSubmissionSchema.index({ exam: 1, student: 1, attemptNumber: 1 });

const ExamSubmission = mongoose.model('ExamSubmission', examSubmissionSchema);

module.exports = ExamSubmission;