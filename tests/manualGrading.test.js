const mongoose = require('mongoose');
const User = require('../models/userModel');
const Exam = require('../models/examModel');
const Course = require('../models/courseModel');
const Question = require('../models/questionModel');
const ExamSubmissionNew = require('../models/examSubmissionNewModel');
const { getSubmissionsForExam, gradeSubmission } = require('../controllers/examSubmissionController');

describe('Manual Grading Functions', () => {
  let universityUser;
  let studentUser;
  let course;
  let exam;
  let question1;
  let question2;
  let submission;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/skilldad_test');
    }

    // Create university user
    universityUser = await User.create({
      name: 'Test University',
      email: `university_${Date.now()}@test.com`,
      password: 'password123',
      role: 'university'
    });

    // Create student user
    studentUser = await User.create({
      name: 'Test Student',
      email: `student_${Date.now()}@test.com`,
      password: 'password123',
      role: 'student'
    });

    // Create course
    course = await Course.create({
      title: 'Test Course',
      description: 'Test Description',
      instructor: universityUser._id,
      price: 1000,
      duration: 30
    });

    // Create exam
    exam = await Exam.create({
      title: 'Test Exam',
      course: course._id,
      university: universityUser._id,
      createdBy: universityUser._id,
      examType: 'mixed',
      scheduledStartTime: new Date(Date.now() - 3600000), // 1 hour ago
      scheduledEndTime: new Date(Date.now() + 3600000), // 1 hour from now
      duration: 60,
      totalMarks: 20
    });

    // Create questions
    question1 = await Question.create({
      exam: exam._id,
      questionType: 'mcq',
      questionText: 'What is 2+2?',
      options: [
        { text: '3', isCorrect: false },
        { text: '4', isCorrect: true },
        { text: '5', isCorrect: false }
      ],
      marks: 10,
      order: 1
    });

    question2 = await Question.create({
      exam: exam._id,
      questionType: 'descriptive',
      questionText: 'Explain the concept of inheritance.',
      marks: 10,
      order: 2
    });

    // Create submission
    submission = await ExamSubmissionNew.create({
      exam: exam._id,
      student: studentUser._id,
      startedAt: new Date(Date.now() - 1800000), // 30 minutes ago
      submittedAt: new Date(),
      status: 'submitted',
      answers: [
        {
          question: question1._id,
          questionType: 'mcq',
          selectedOption: 1,
          marksAwarded: 10,
          isCorrect: true
        },
        {
          question: question2._id,
          questionType: 'descriptive',
          textAnswer: 'Inheritance is a mechanism where a new class inherits properties from an existing class.'
        }
      ]
    });
  });

  afterAll(async () => {
    // Clean up
    await User.deleteMany({ email: { $regex: /@test\.com$/ } });
    await Course.deleteMany({ title: 'Test Course' });
    await Exam.deleteMany({ title: 'Test Exam' });
    await Question.deleteMany({ exam: exam._id });
    await ExamSubmissionNew.deleteMany({ exam: exam._id });
    await mongoose.connection.close();
  });

  describe('getSubmissionsForExam', () => {
    it('should get submissions for exam (university)', async () => {
      const req = {
        params: { examId: exam._id },
        query: {},
        user: { _id: universityUser._id, role: 'university' }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await getSubmissionsForExam(req, res, jest.fn());

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.submissions).toBeDefined();
      expect(Array.isArray(response.submissions)).toBe(true);
      expect(response.pagination).toBeDefined();
    });

    it('should support pagination', async () => {
      const req = {
        params: { examId: exam._id },
        query: { page: '1', limit: '10' },
        user: { _id: universityUser._id, role: 'university' }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await getSubmissionsForExam(req, res, jest.fn());

      const response = res.json.mock.calls[0][0];
      expect(response.pagination.currentPage).toBe(1);
      expect(response.pagination.limit).toBe(10);
    });
  });

  describe('gradeSubmission', () => {
    it('should grade submission successfully', async () => {
      const req = {
        params: { submissionId: submission._id },
        body: {
          answers: [
            {
              questionId: question2._id.toString(),
              marksAwarded: 8,
              feedback: 'Good explanation, but could include more details.'
            }
          ]
        },
        user: { _id: universityUser._id, role: 'university' }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await gradeSubmission(req, res, jest.fn());

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.submission.status).toBe('graded');
      expect(response.submission.obtainedMarks).toBe(18); // 10 (MCQ) + 8 (descriptive)
      expect(response.submission.percentage).toBe(90);
      expect(response.submission.gradedBy).toBeDefined();
      expect(response.submission.gradedAt).toBeDefined();
    });

    it('should reject grading with invalid marks', async () => {
      const req = {
        params: { submissionId: submission._id },
        body: {
          answers: [
            {
              questionId: question2._id.toString(),
              marksAwarded: 15, // More than max marks (10)
              feedback: 'Test'
            }
          ]
        },
        user: { _id: universityUser._id, role: 'university' }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const next = jest.fn();

      try {
        await gradeSubmission(req, res, next);
      } catch (error) {
        expect(error.message).toContain('must be between 0 and');
      }
    });
  });
});
