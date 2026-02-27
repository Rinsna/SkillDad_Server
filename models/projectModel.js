const mongoose = require('mongoose');

const projectSchema = mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true,
    },
    instructor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    requirements: [String],
    submissionGuidelines: String,
    maxFileSize: {
        type: String,
        default: '50MB',
    },
    allowedFormats: [String],
    points: {
        type: Number,
        default: 100,
    },
    difficulty: {
        type: String,
        enum: ['Beginner', 'Intermediate', 'Advanced'],
        default: 'Intermediate',
    },
    deadline: {
        type: Date,
        required: true,
    },
    isPublished: {
        type: Boolean,
        default: false,
    },
    rubric: [{
        criteria: String,
        points: Number,
        description: String,
    }],
}, {
    timestamps: true,
});

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;