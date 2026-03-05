/**
 * Auto-Grading Service Tests
 * 
 * Tests for MCQ auto-grading functionality
 */

const mongoose = require('mongoose');
const ExamSubmissionNew = require('../models/examSubmissionNewModel');
const Exam = require('../models/examModel');
const Question = require('../models/questionModel');
const { autoGradeMCQSubmission } = require('../services/autoGradingService');

describe('Auto-Grading Service', () => {
  let examId, submissionId, questionIds;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/skilldad_test');
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (examId) await Exam.findByIdAndDelete(examId);
    if (submissionId) await ExamSubmissionNew.findByIdAndDelete(submissionId);
    if (questionIds) await Question.deleteMany({ _id: { $in: questionIds } });
    
    await mongoose.connection.close();
  });

  describe('autoGradeMCQSubmission', () => {
    it('should grade MCQ questions correctly with positive marks', async () => {
      // Create test exam
      const exam = await Exam.create({
        title: 'Test Exam',
        course: new mongoose.Types.ObjectId(),
        university: new mongoose.Types.ObjectId(),
        createdBy: new mongoose.Types.ObjectId(),
        examType: 'online-mcq',
        scheduledStartTime: new Date(),
        scheduledEndTime: new Date(Date.now() + 3600000),
        duration: 60,
        totalMarks: 10,
      });
      examId = exam._id;

      // Create test questions
      const question1 = await Question.create({
        exam: examId,
        questionType: 'mcq',
        questionText: 'What is 2+2?',
        options: [
          { text: '3', isCorrect: false },
          { text: '4', isCorrect: true },
          { text: '5', isCorrect: false },
        ],
        marks: 5,
        negativeMarks: 1,
        order: 1,
      });

      const question2 = await Question.create({
        exam: examId,
        questionType: 'mcq',
        questionText: 'What is the capital of France?',
        options: [
          { text: 'London', isCorrect: false },
          { text: 'Paris', isCorrect: true },
          { text: 'Berlin', isCorrect: false },
        ],
        marks: 5,
        negativeMarks: 1,
        order: 2,
      });

      questionIds = [question1._id, question2._id];

      // Create test submission with answers
      const submission = await ExamSubmissionNew.create({
        exam: examId,
        student: new mongoose.Types.ObjectId(),
        startedAt: new Date(),
        submittedAt: new Date(),
        status: 'submitted',
        answers: [
          {
            question: question1._id,
            questionType: 'mcq',
            selectedOption: 1, // Correct answer
          },
          {
            question: question2._id,
            questionType: 'mcq',
            selectedOption: 1, // Correct answer
          },
        ],
      });
      submissionId = submission._id;

      // Grade the submission
      const result = await autoGradeMCQSubmission(submissionId);

      // Assertions
      expect(result.mcqCount).toBe(2);
      expect(result.correctCount).toBe(2);
      expect(result.incorrectCount).toBe(0);
      expect(result.obtainedMarks).toBe(10);
      expect(result.totalMarks).toBe(10);
      expect(result.percentage).toBe(100);
      expect(result.status).toBe('graded');
    });

    it('should apply negative marking for incorrect answers', async () => {
      // Create test exam
      const exam = await Exam.create({
        title: 'Test Exam 2',
        course: new mongoose.Types.ObjectId(),
        university: new mongoose.Types.ObjectId(),
        createdBy: new mongoose.Types.ObjectId(),
        examType: 'online-mcq',
        scheduledStartTime: new Date(),
        scheduledEndTime: new Date(Date.now() + 3600000),
        duration: 60,
        totalMarks: 10,
      });
      const testExamId = exam._id;

      // Create test question
      const question = await Question.create({
        exam: testExamId,
        questionType: 'mcq',
        questionText: 'Test question',
        options: [
          { text: 'Wrong', isCorrect: false },
          { text: 'Correct', isCorrect: true },
        ],
        marks: 5,
        negativeMarks: 2,
        order: 1,
      });

      // Create submission with wrong answer
      const submission = await ExamSubmissionNew.create({
        exam: testExamId,
        student: new mongoose.Types.ObjectId(),
        startedAt: new Date(),
        submittedAt: new Date(),
        status: 'submitted',
        answers: [
          {
            question: question._id,
            questionType: 'mcq',
            selectedOption: 0, // Wrong answer
          },
        ],
      });

      // Grade the submission
      const result = await autoGradeMCQSubmission(submission._id);

      // Assertions
      expect(result.correctCount).toBe(0);
      expect(result.incorrectCount).toBe(1);
      expect(result.obtainedMarks).toBe(0); // Should be 0, not negative
      expect(result.percentage).toBe(0);

      // Clean up
      await Exam.findByIdAndDelete(testExamId);
      await Question.findByIdAndDelete(question._id);
      await ExamSubmissionNew.findByIdAndDelete(submission._id);
    });

    it('should ensure obtainedMarks is never negative', async () => {
      // Create test exam
      const exam = await Exam.create({
        title: 'Test Exam 3',
        course: new mongoose.Types.ObjectId(),
        university: new mongoose.Types.ObjectId(),
        createdBy: new mongoose.Types.ObjectId(),
        examType: 'online-mcq',
        scheduledStartTime: new Date(),
        scheduledEndTime: new Date(Date.now() + 3600000),
        duration: 60,
        totalMarks: 5,
      });
      const testExamId = exam._id;

      // Create test question with high negative marks
      const question = await Question.create({
        exam: testExamId,
        questionType: 'mcq',
        questionText: 'Test question',
        options: [
          { text: 'Wrong', isCorrect: false },
          { text: 'Correct', isCorrect: true },
        ],
        marks: 5,
        negativeMarks: 10, // Higher than positive marks
        order: 1,
      });

      // Create submission with wrong answer
      const submission = await ExamSubmissionNew.create({
        exam: testExamId,
        student: new mongoose.Types.ObjectId(),
        startedAt: new Date(),
        submittedAt: new Date(),
        status: 'submitted',
        answers: [
          {
            question: question._id,
            questionType: 'mcq',
            selectedOption: 0, // Wrong answer
          },
        ],
      });

      // Grade the submission
      const result = await autoGradeMCQSubmission(submission._id);

      // Assertions - should be 0, not negative
      expect(result.obtainedMarks).toBe(0);
      expect(result.obtainedMarks).toBeGreaterThanOrEqual(0);

      // Clean up
      await Exam.findByIdAndDelete(testExamId);
      await Question.findByIdAndDelete(question._id);
      await ExamSubmissionNew.findByIdAndDelete(submission._id);
    });
  });
});
