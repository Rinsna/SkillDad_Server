const mongoose = require('mongoose');

const fileSchema = mongoose.Schema({
    fileName: String,
    fileUrl: String,
    fileSize: Number,
    uploadedAt: {
        type: Date,
        default: Date.now,
    },
});

const projectSubmissionSchema = mongoose.Schema({
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    files: [fileSchema],
    submissionText: String,
    status: {
        type: String,
        enum: ['draft', 'submitted', 'graded', 'returned'],
        default: 'draft',
    },
    submittedAt: Date,
    grade: {
        type: String,
        enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'],
    },
    score: {
        type: Number,
        min: 0,
        max: 100,
    },
    feedback: String,
    rubricScores: [{
        criteria: String,
        score: Number,
        feedback: String,
    }],
    gradedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    gradedAt: Date,
    isLate: {
        type: Boolean,
        default: false,
    },
    attemptNumber: {
        type: Number,
        default: 1,
    },
}, {
    timestamps: true,
});

// Compound index for efficient queries
projectSubmissionSchema.index({ project: 1, student: 1 });

const ProjectSubmission = mongoose.model('ProjectSubmission', projectSubmissionSchema);

module.exports = ProjectSubmission;