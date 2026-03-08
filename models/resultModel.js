const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
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
  submission: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamSubmissionNew',
    required: true
  },

  // Scores
  totalMarks: {
    type: Number,
    required: true,
    min: 0
  },
  obtainedMarks: {
    type: Number,
    required: true,
    min: 0
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  grade: {
    type: String
  }, // A+, A, B+, etc.

  // Status
  isPassed: {
    type: Boolean
  },
  rank: {
    type: Number,
    min: 1
  }, // rank among all students

  // Visibility
  isPublished: {
    type: Boolean,
    default: false,
    index: true
  },
  publishedAt: {
    type: Date
  },

  // Feedback
  overallFeedback: {
    type: String,
    maxlength: 1000
  },

  // Metadata
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  viewedByStudent: {
    type: Boolean,
    default: false
  },
  viewedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Calculate grade based on percentage
resultSchema.methods.calculateGrade = function () {
  if (this.percentage >= 90) return 'A+';
  if (this.percentage >= 80) return 'A';
  if (this.percentage >= 70) return 'B+';
  if (this.percentage >= 60) return 'B';
  if (this.percentage >= 50) return 'C';
  if (this.percentage >= 40) return 'D';
  return 'F';
};

// Pre-save hook to auto-calculate grade if not set
resultSchema.pre('save', async function () {
  if (!this.grade && this.percentage !== undefined) {
    this.grade = this.calculateGrade();
  }
});

// Compound index for unique student-exam combination
resultSchema.index({ exam: 1, student: 1 }, { unique: true });

// Additional indexes for performance
resultSchema.index({ exam: 1, rank: 1 });
resultSchema.index({ exam: 1, isPublished: 1 });
resultSchema.index({ student: 1, isPublished: 1 });

const Result = mongoose.models.Result || mongoose.model('Result', resultSchema);

module.exports = Result;
