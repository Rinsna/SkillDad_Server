const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  exam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true,
    index: true
  },

  questionType: {
    type: String,
    enum: ['mcq', 'descriptive'],
    required: true
  },

  questionText: {
    type: String,
    required: true,
    maxlength: 2000
  },
  questionImage: {
    type: String
  }, // Optional image URL

  // MCQ specific fields
  options: [{
    text: {
      type: String,
      required: true
    },
    isCorrect: {
      type: Boolean,
      default: false
    }
  }],

  // Grading
  marks: {
    type: Number,
    required: true,
    min: 0
  },
  negativeMarks: {
    type: Number,
    default: 0,
    min: 0
  },

  // Metadata
  order: {
    type: Number,
    required: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard']
  },
  tags: [{
    type: String
  }]
}, {
  timestamps: true
});

// Validation for MCQ questions
questionSchema.pre('validate', function (next) {
  if (this.questionType === 'mcq') {
    // MCQ must have at least 2 options
    if (!this.options || this.options.length < 2) {
      next(new Error('MCQ questions must have at least 2 options'));
      return;
    }

    // Exactly one option must be marked as correct
    const correctOptions = this.options.filter(opt => opt.isCorrect);
    if (correctOptions.length !== 1) {
      next(new Error('MCQ questions must have exactly one correct option'));
      return;
    }
  }

  // Validate negative marks are less than positive marks
  if (this.negativeMarks >= this.marks) {
    next(new Error('negativeMarks must be less than marks'));
    return;
  }

  next();
});

// Compound index for unique order within exam
questionSchema.index({ exam: 1, order: 1 }, { unique: true });

const Question = mongoose.models.Question || mongoose.model('Question', questionSchema);

module.exports = Question;
