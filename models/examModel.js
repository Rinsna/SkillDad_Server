const mongoose = require('mongoose');

const questionSchema = mongoose.Schema({
    question: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: ['multiple-choice', 'true-false', 'short-answer', 'essay'],
        default: 'multiple-choice',
    },
    options: [{
        text: String,
        isCorrect: Boolean,
    }],
    correctAnswer: String, // For non-MCQ questions
    points: {
        type: Number,
        default: 1,
    },
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium',
    },
});

const examSchema = mongoose.Schema({
    title: {
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
    targetUniversity: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to the University user
    },
    description: String,
    type: {
        type: String,
        enum: ['quiz', 'midterm', 'final', 'assignment'],
        default: 'quiz',
    },
    questions: [questionSchema],
    duration: {
        type: Number, // Duration in minutes
        required: true,
    },
    totalPoints: {
        type: Number,
        default: 0,
    },
    passingScore: {
        type: Number,
        default: 70, // Percentage
    },
    maxAttempts: {
        type: Number,
        default: 1,
    },
    scheduledDate: Date,
    deadline: Date,
    isPublished: {
        type: Boolean,
        default: false,
    },
    allowReview: {
        type: Boolean,
        default: true,
    },
    shuffleQuestions: {
        type: Boolean,
        default: false,
    },
    instructions: String,
    linkedPaper: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
    },
    examMode: {
        type: String,
        enum: ['digital', 'paper-based'],
        default: 'digital'
    }
}, {
    timestamps: true,
});

const Exam = mongoose.model('Exam', examSchema);

module.exports = Exam;