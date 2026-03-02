const mongoose = require('mongoose');

// Code submission schema for code-submission questions
const codeSubmissionSchema = mongoose.Schema({
    code: { type: String, required: true },
    language: { type: String, required: true },
    testResults: [{
        input: String,
        expectedOutput: String,
        actualOutput: String,
        passed: Boolean,
        points: Number
    }],
    executionTime: { type: Number, min: 0 }, // in milliseconds
    memoryUsed: { type: Number, min: 0 } // in bytes
});

// Answer schema for individual question answers
const answerSchema = mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    answerValue: {
        type: mongoose.Schema.Types.Mixed, // String, array, or CodeSubmission
        required: true
    },
    isCorrect: { type: Boolean }, // null for subjective questions
    pointsEarned: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    feedback: { type: String },
    gradedAt: { type: Date }
});

// Submission schema
const submissionSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    module: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    content: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InteractiveContent',
        required: true
    },
    contentType: {
        type: String,
        required: true,
        enum: ['exercise', 'practice', 'quiz']
    },
    
    answers: {
        type: [answerSchema],
        required: true,
        validate: {
            validator: function(v) {
                return v && v.length > 0;
            },
            message: 'Submission must have at least one answer'
        }
    },
    
    score: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        max: 100
    }, // percentage
    maxScore: {
        type: Number,
        required: true,
        min: 0
    }, // total possible points
    isPassing: {
        type: Boolean,
        default: false
    },
    
    status: {
        type: String,
        required: true,
        enum: ['pending', 'graded', 'needs-review'],
        default: 'pending'
    },
    gradedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    gradedAt: { type: Date },
    feedback: { type: String },
    
    attemptNumber: {
        type: Number,
        required: true,
        min: 1
    },
    startedAt: {
        type: Date,
        required: true
    },
    submittedAt: {
        type: Date,
        required: true
    },
    timeSpent: {
        type: Number,
        required: true,
        min: 0
    } // in seconds
}, {
    timestamps: true
});

// Validation for submission-level rules
submissionSchema.pre('validate', function() {
    // Validate submittedAt is after startedAt
    if (this.submittedAt && this.startedAt && this.submittedAt < this.startedAt) {
        throw new Error('submittedAt must be after startedAt');
    }
    
    // Validate score is between 0 and 100
    if (this.score < 0 || this.score > 100) {
        throw new Error('Score must be between 0 and 100');
    }
    
    // Validate attemptNumber is positive
    if (this.attemptNumber < 1) {
        throw new Error('attemptNumber must be a positive integer');
    }
});

// Index for efficient queries
submissionSchema.index({ user: 1, course: 1 });
submissionSchema.index({ content: 1, attemptNumber: 1 });
submissionSchema.index({ status: 1, course: 1 });

const Submission = mongoose.model('Submission', submissionSchema);

module.exports = Submission;
