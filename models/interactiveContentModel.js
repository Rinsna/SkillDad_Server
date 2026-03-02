const mongoose = require('mongoose');

// Test case schema for code-submission questions
const testCaseSchema = mongoose.Schema({
    input: { type: String, required: true },
    expectedOutput: { type: String, required: true },
    isHidden: { type: Boolean, default: false },
    points: { type: Number, required: true, min: 0 }
});

// Question schema supporting multiple question types
const questionSchema = mongoose.Schema({
    questionType: {
        type: String,
        required: true,
        enum: ['multiple-choice', 'true-false', 'short-answer', 'code-submission', 'essay']
    },
    questionText: { type: String, required: true },
    points: { type: Number, required: true, min: 0 },
    
    // For multiple-choice questions
    options: [{ type: String }],
    correctAnswer: { type: mongoose.Schema.Types.Mixed }, // String or array of strings
    
    // For short-answer questions
    acceptedAnswers: [{ type: String }],
    
    // For code-submission questions
    language: { type: String },
    starterCode: { type: String },
    testCases: [testCaseSchema],
    
    // For essay questions
    maxWords: { type: Number, min: 1 },
    rubric: { type: String },
    
    // Optional explanation shown after submission
    explanation: { type: String },
    hints: [{ type: String }]
});

// Validation for question-specific fields
questionSchema.pre('validate', function() {
    // Multiple-choice validation
    if (this.questionType === 'multiple-choice') {
        if (!this.options || this.options.length < 2 || this.options.length > 10) {
            throw new Error('Multiple-choice questions must have 2-10 options');
        }
        if (!this.correctAnswer) {
            throw new Error('Multiple-choice questions must have a correctAnswer');
        }
    }
    
    // True-false validation
    if (this.questionType === 'true-false') {
        if (this.correctAnswer === undefined || this.correctAnswer === null) {
            throw new Error('True-false questions must have a correctAnswer');
        }
    }
    
    // Short-answer validation
    if (this.questionType === 'short-answer') {
        if (!this.acceptedAnswers || this.acceptedAnswers.length === 0) {
            throw new Error('Short-answer questions must have at least one accepted answer');
        }
    }
    
    // Code-submission validation
    if (this.questionType === 'code-submission') {
        if (!this.language) {
            throw new Error('Code-submission questions must specify a programming language');
        }
    }
});

// Interactive content schema
const interactiveContentSchema = mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['exercise', 'practice', 'quiz']
    },
    title: {
        type: String,
        required: true,
        maxlength: 200
    },
    description: { type: String, required: true },
    instructions: { type: String, required: true },
    
    timeLimit: { type: Number, min: 1 }, // in minutes, null for untimed
    attemptsAllowed: {
        type: Number,
        required: true,
        default: -1, // -1 for unlimited
        validate: {
            validator: function(v) {
                return v === -1 || v > 0;
            },
            message: 'attemptsAllowed must be -1 (unlimited) or a positive integer'
        }
    },
    
    passingScore: {
        type: Number,
        min: 0,
        max: 100
    }, // percentage, only for quizzes
    
    showSolutionAfter: {
        type: String,
        enum: ['immediate', 'submission', 'never'],
        default: 'submission'
    },
    
    questions: {
        type: [questionSchema],
        required: true,
        validate: {
            validator: function(v) {
                return v && v.length > 0;
            },
            message: 'Interactive content must have at least one question'
        }
    }
}, {
    timestamps: true
});

// Validation for content-level rules
interactiveContentSchema.pre('validate', function() {
    // Validate passingScore only for quizzes
    if (this.type === 'quiz' && this.passingScore !== undefined && this.passingScore !== null) {
        if (this.passingScore < 0 || this.passingScore > 100) {
            throw new Error('Passing score must be between 0 and 100');
        }
    }
    
    // Validate timeLimit if provided
    if (this.timeLimit !== undefined && this.timeLimit !== null && this.timeLimit <= 0) {
        throw new Error('Time limit must be a positive number');
    }
});

const InteractiveContent = mongoose.model('InteractiveContent', interactiveContentSchema);

module.exports = InteractiveContent;
