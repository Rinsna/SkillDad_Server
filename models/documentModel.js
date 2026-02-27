const mongoose = require('mongoose');

const documentSchema = mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    description: String,
    type: {
        type: String,
        enum: ['certificate', 'identity', 'academic', 'portfolio', 'assignment', 'exam_paper', 'answer_sheet', 'other'],
        required: true,
    },
    format: {
        type: String,
        enum: ['PDF', 'DOC', 'DOCX', 'JPG', 'PNG', 'ZIP'],
        required: true,
    },
    maxSize: {
        type: String,
        default: '10MB',
    },
    isRequired: {
        type: Boolean,
        default: false,
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    recipientUniversity: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // University accounts are Users with role 'university'
    },
    fileUrl: String,
    fileName: String,
    fileSize: Number, // Size in bytes
    status: {
        type: String,
        enum: ['pending', 'submitted', 'approved', 'rejected'],
        default: 'pending',
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    reviewedAt: Date,
    rejectionReason: String,
    deadline: Date,
    tags: [String],
}, {
    timestamps: true,
});

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;