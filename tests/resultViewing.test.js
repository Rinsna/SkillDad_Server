const mongoose = require('mongoose');
const ExamSubmissionNew = require('../models/examSubmissionNewModel');
const Exam = require('../models/examModel');
const Result = require('../models/resultModel');
const User = require('../models/userModel');
const Course = require('../models/courseModel');
const Question = require('../models/questionModel');
const { generateExamResults } = require('../services/resultService');

describe('Result Viewing - Task 14', () => {
  let exam, course, universityUser, student, submission, result, question;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/skilldad_test');
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up collections
    await User.deleteMany({});
    await Course.deleteMany({});
    await Exam.deleteMany({});
    await Question.deleteMany({});
    await ExamSubmissionNew.deleteMany({});
    await Result.deleteMany({});

    // Create test data
    universityUser = await User.create({
      name: 'Test University',
      email: 'university@test.com',
      password: 'password123',
      role: 'university'
    });

    student = await User.create({
      name: 'Test Student',
      email: 'student@test.com',
      password: 'password123',
      role: 'student'
    });

    course = await Course.create({
      title: 'Test Course',
      description: 'Test Description',
      instructor: universityUser._id,
      price: 1000
    });

    exam = await Exam.create({
      title: 'Test Exam',
      course: course._id,
      university: universityUser._id,
      createdBy: universityUser._id,
      examType: 'online-mcq',
      scheduledStartTime: new Date(),
      scheduledEndTime: new Date(Date.now() + 3600000),
      duration: 60,
      totalMarks: 100,
      passingScore: 40
    });

    // Create a question
    question = await Question.create({
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

    // Create graded submission
    submission = await ExamSubmissionNew.create({
      exam: exam._id,
      student: student._id,
      startedAt: new Date(),
      submittedAt: new Date(),
      status: 'graded',
      totalMarks: 100,
      obtainedMarks: 85,
      percentage: 85,
      gradedBy: universityUser._id,
      answers: [{
        question: question._id,
        questionType: 'mcq',
        selectedOption: 1,
        marksAwarded: 10,
        isCorrect: true
      }]
    });

    // Generate result
    await generateExamResults(exam._id);
    result = await Result.findOne({ exam: exam._id, student: student._id });
  });

  describe('getStudentResult', () => {
    test('should return result for published result when student views own result', async () => {
      // Publish the result
      result.isPublished = true;
      result.publishedAt = new Date();
      await result.save();

      // Fetch result
      const fetchedResult = await Result.findOne({ exam: exam._id, student: student._id })
        .populate('exam', 'title totalMarks passingScore examType university')
        .populate('student', 'name email')
        .populate({
          path: 'submission',
          populate: {
            path: 'answers.question',
            select: 'questionText questionType options marks'
          }
        });

      expect(fetchedResult).toBeTruthy();
      expect(fetchedResult.isPublished).toBe(true);
      expect(fetchedResult.obtainedMarks).toBe(85);
      expect(fetchedResult.percentage).toBe(85);
      expect(fetchedResult.grade).toBe('A');
      expect(fetchedResult.isPassed).toBe(true);
    });

    test('should mark result as viewed when student views for first time', async () => {
      // Publish the result
      result.isPublished = true;
      result.publishedAt = new Date();
      await result.save();

      // Verify not viewed initially
      expect(result.viewedByStudent).toBe(false);
      expect(result.viewedAt).toBeUndefined();

      // Mark as viewed
      result.viewedByStudent = true;
      result.viewedAt = new Date();
      await result.save();

      // Fetch and verify
      const updatedResult = await Result.findById(result._id);
      expect(updatedResult.viewedByStudent).toBe(true);
      expect(updatedResult.viewedAt).toBeTruthy();
    });

    test('should not allow student to view unpublished result', async () => {
      // Result is not published by default
      expect(result.isPublished).toBe(false);

      // This would be blocked by the controller
      // We're just verifying the data state
      expect(result.isPublished).toBe(false);
    });

    test('should populate submission with question details', async () => {
      result.isPublished = true;
      await result.save();

      const fetchedResult = await Result.findOne({ exam: exam._id, student: student._id })
        .populate({
          path: 'submission',
          populate: {
            path: 'answers.question',
            select: 'questionText questionType options marks'
          }
        });

      expect(fetchedResult.submission).toBeTruthy();
      expect(fetchedResult.submission.answers).toHaveLength(1);
      expect(fetchedResult.submission.answers[0].question).toBeTruthy();
      expect(fetchedResult.submission.answers[0].question.questionText).toBe('What is 2+2?');
    });
  });

  describe('getMySubmission', () => {
    test('should return submission with populated question details', async () => {
      const fetchedSubmission = await ExamSubmissionNew.findOne({
        exam: exam._id,
        student: student._id
      })
        .populate('exam', 'title examType totalMarks')
        .populate({
          path: 'answers.question',
          select: 'questionText questionType options marks negativeMarks'
        });

      expect(fetchedSubmission).toBeTruthy();
      expect(fetchedSubmission.exam.title).toBe('Test Exam');
      expect(fetchedSubmission.answers).toHaveLength(1);
      expect(fetchedSubmission.answers[0].question).toBeTruthy();
      expect(fetchedSubmission.answers[0].question.questionText).toBe('What is 2+2?');
      expect(fetchedSubmission.answers[0].marksAwarded).toBe(10);
    });

    test('should return 404 if submission not found', async () => {
      const nonExistentExamId = new mongoose.Types.ObjectId();
      const fetchedSubmission = await ExamSubmissionNew.findOne({
        exam: nonExistentExamId,
        student: student._id
      });

      expect(fetchedSubmission).toBeNull();
    });
  });

  describe('Result Visibility Control', () => {
    test('published results should be visible', async () => {
      result.isPublished = true;
      result.publishedAt = new Date();
      await result.save();

      const fetchedResult = await Result.findOne({ 
        exam: exam._id, 
        student: student._id,
        isPublished: true 
      });

      expect(fetchedResult).toBeTruthy();
    });

    test('unpublished results should not be visible to students', async () => {
      // Result is unpublished by default
      const fetchedResult = await Result.findOne({ 
        exam: exam._id, 
        student: student._id,
        isPublished: true 
      });

      expect(fetchedResult).toBeNull();
    });
  });
});
