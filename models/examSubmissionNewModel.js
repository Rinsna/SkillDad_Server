const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  question: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  },
  questionType: {
    type: String,
    enum: ['mcq', 'descriptive']
  },

  // MCQ answer
  selectedOption: {
    type: Number
  }, // index of selected option

  // Descriptive answer
  textAnswer: {
    type: String,
    maxlength: 10000
  },

  // Grading
  marksAwarded: {
    type: Number,
    default: 0
  },
  isCorrect: {
    type: Boolean
  }, // for MCQ auto-grading
  feedback: {
    type: String
  } // for descriptive questions
}, { _id: false });

const examSubmissionNewSchema = new mongoose.Schema({
  exam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true,
    index: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Timing
  startedAt: {
    type: Date,
    required: true
  },
  submittedAt: {
    type: Date
  },
  timeSpent: {
    type: Number
  }, // in seconds
  isAutoSubmitted: {
    type: Boolean,
    default: false
  },

  // Answers for online exams
  answers: [answerSchema],

  // PDF-based exam answer sheet
  answerSheetUrl: {
    type: String
  },

  // Status
  status: {
    type: String,
    enum: ['in-progress', 'submitted', 'graded'],
    default: 'in-progress',
    index: true
  },

  // Grading
  totalMarks: {
    type: Number,
    default: 0
  },
  obtainedMarks: {
    type: Number,
    default: 0
  },
  percentage: {
    type: Number,
    default: 0
  },
  gradedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  gradedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Validation
examSubmissionNewSchema.pre('validate', function (next) {
  // Validate submittedAt is after startedAt
  if (this.submittedAt && this.startedAt && this.submittedAt < this.startedAt) {
    next(new Error('submittedAt must be after startedAt'));
    return;
  }

  // Calculate timeSpent if submittedAt is set
  if (this.submittedAt && this.startedAt && !this.timeSpent) {
    this.timeSpent = Math.floor((this.submittedAt - this.startedAt) / 1000);
  }

  // Calculate percentage if obtainedMarks and totalMarks are set
  if (this.totalMarks > 0 && this.obtainedMarks >= 0) {
    this.percentage = (this.obtainedMarks / this.totalMarks) * 100;
  }

  next();
});

// Compound index for unique student-exam combination
examSubmissionNewSchema.index({ exam: 1, student: 1 }, { unique: true });

// Additional indexes for performance
examSubmissionNewSchema.index({ exam: 1, status: 1 });
examSubmissionNewSchema.index({ student: 1, status: 1 });

const ExamSubmissionNew = mongoose.models.ExamSubmissionNew || mongoose.model('ExamSubmissionNew', examSubmissionNewSchema);

module.exports = ExamSubmissionNew;
