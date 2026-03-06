const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },

  // Relationships
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  university: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Exam Type
  examType: {
    type: String,
    enum: ['pdf-based', 'online-mcq', 'online-descriptive', 'mixed'],
    required: true
  },
  isMockExam: {
    type: Boolean,
    default: false
  },

  // Scheduling
  scheduledStartTime: {
    type: Date,
    required: true,
    index: true
  },
  scheduledEndTime: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    required: true,
    min: 1
  }, // in minutes

  // PDF-based exam fields
  questionPaperUrl: {
    type: String
  },

  // Access Control
  allowLateSubmission: {
    type: Boolean,
    default: false
  },
  lateSubmissionDeadline: {
    type: Date
  },

  // Status
  status: {
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'graded', 'published'],
    default: 'scheduled',
    index: true
  },

  // Result Control
  resultsPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date
  },

  // Configuration
  shuffleQuestions: {
    type: Boolean,
    default: false
  },
  showResultsImmediately: {
    type: Boolean,
    default: false
  },
  passingScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 40
  },

  // Metadata
  totalMarks: {
    type: Number,
    required: true,
    min: 0
  },
  instructions: {
    type: String,
    maxlength: 2000
  }
}, {
  timestamps: true
});

// Validation: scheduledEndTime must be after scheduledStartTime
examSchema.pre('validate', function () {
  if (this.scheduledEndTime && this.scheduledStartTime) {
    if (this.scheduledEndTime <= this.scheduledStartTime) {
      this.invalidate('scheduledEndTime', 'scheduledEndTime must be after scheduledStartTime');
    }

    // Validate duration fits within time window
    const timeWindowMinutes = (this.scheduledEndTime - this.scheduledStartTime) / (1000 * 60);
    if (this.duration > timeWindowMinutes) {
      this.invalidate('duration', 'duration must fit within the time window between start and end times');
    }
  }

  // Validate questionPaperUrl is required for pdf-based exams
  if (this.examType === 'pdf-based' && !this.questionPaperUrl && !this.isNew) {
    this.invalidate('questionPaperUrl', 'questionPaperUrl is required for pdf-based exams');
  }
});

// Compound indexes for performance
examSchema.index({ course: 1, status: 1 });
examSchema.index({ university: 1, status: 1 });
examSchema.index({ scheduledStartTime: 1, status: 1 });
examSchema.index({ status: 1, scheduledEndTime: 1 }); // For finding exams by status and end time

const Exam = mongoose.models.Exam || mongoose.model('Exam', examSchema);

module.exports = Exam;