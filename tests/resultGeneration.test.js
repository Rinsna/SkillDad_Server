const mongoose = require('mongoose');
const ExamSubmissionNew = require('../models/examSubmissionNewModel');
const Exam = require('../models/examModel');
const Result = require('../models/resultModel');
const User = require('../models/userModel');
const Course = require('../models/courseModel');
const { generateExamResults } = require('../services/resultService');

describe('Result Generation and Ranking', () => {
  let exam, course, universityUser, students, submissions;

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
    // Create test data
    universityUser = await User.create({
      name: 'Test University',
      email: 'university@test.com',
      password: 'password123',
      role: 'university'
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

    // Create students
    students = await User.create([
      { name: 'Student 1', email: 'student1@test.com', password: 'pass123', role: 'student' },
      { name: 'Student 2', email: 'student2@test.com', password: 'pass123', role: 'student' },
      { name: 'Student 3', email: 'student3@test.com', password: 'pass123', role: 'student' },
      { name: 'Student 4', email: 'student4@test.com', password: 'pass123', role: 'student' },
      { name: 'Student 5', email: 'student5@test.com', password: 'pass123', role: 'student' }
    ]);

    // Create graded submissions with different scores
    submissions = await ExamSubmissionNew.create([
      {
        exam: exam._id,
        student: students[0]._id,
        startedAt: new Date(),
        submittedAt: new Date(),
        status: 'graded',
        totalMarks: 100,
        obtainedMarks: 95,
        percentage: 95,
        gradedBy: universityUser._id
      },
      {
        exam: exam._id,
        student: students[1]._id,
        startedAt: new Date(),
        submittedAt: new Date(),
        status: 'graded',
        totalMarks: 100,
        obtainedMarks: 85,
        percentage: 85,
        gradedBy: universityUser._id
      },
      {
        exam: exam._id,
        student: students[2]._id,
        startedAt: new Date(),
        submittedAt: new Date(),
        status: 'graded',
        totalMarks: 100,
        obtainedMarks: 85, // Same as student 2 - should have same rank
        percentage: 85,
        gradedBy: universityUser._id
      },
      {
        exam: exam._id,
        student: students[3]._id,
        startedAt: new Date(),
        submittedAt: new Date(),
        status: 'graded',
        totalMarks: 100,
        obtainedMarks: 70,
        percentage: 70,
        gradedBy: universityUser._id
      },
      {
        exam: exam._id,
        student: students[4]._id,
        startedAt: new Date(),
        submittedAt: new Date(),
        status: 'graded',
        totalMarks: 100,
        obtainedMarks: 35,
        percentage: 35,
        gradedBy: universityUser._id
      }
    ]);
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Course.deleteMany({});
    await Exam.deleteMany({});
    await ExamSubmissionNew.deleteMany({});
    await Result.deleteMany({});
  });

  describe('generateExamResults', () => {
    it('should generate results for all graded submissions', async () => {
      const results = await generateExamResults(exam._id);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.exam.toString() === exam._id.toString())).toBe(true);
    });

    it('should calculate correct rankings with tie handling', async () => {
      const results = await generateExamResults(exam._id);

      // Sort by rank to verify
      const sortedResults = results.sort((a, b) => a.rank - b.rank);

      // Student 1: 95 marks - Rank 1
      expect(sortedResults[0].obtainedMarks).toBe(95);
      expect(sortedResults[0].rank).toBe(1);

      // Students 2 and 3: 85 marks - Both Rank 2 (tied)
      const rank2Students = sortedResults.filter(r => r.rank === 2);
      expect(rank2Students).toHaveLength(2);
      expect(rank2Students.every(r => r.obtainedMarks === 85)).toBe(true);

      // Student 4: 70 marks - Rank 4 (not 3, because 2 students tied at rank 2)
      const rank4Student = sortedResults.find(r => r.obtainedMarks === 70);
      expect(rank4Student.rank).toBe(4);

      // Student 5: 35 marks - Rank 5
      const rank5Student = sortedResults.find(r => r.obtainedMarks === 35);
      expect(rank5Student.rank).toBe(5);
    });

    it('should calculate correct grades based on percentage', async () => {
      const results = await generateExamResults(exam._id);

      const resultMap = new Map(results.map(r => [r.obtainedMarks, r.grade]));

      expect(resultMap.get(95)).toBe('A+'); // 95% -> A+
      expect(resultMap.get(85)).toBe('A');  // 85% -> A
      expect(resultMap.get(70)).toBe('B+'); // 70% -> B+
      expect(resultMap.get(35)).toBe('F');  // 35% -> F
    });

    it('should determine pass/fail based on passing score', async () => {
      const results = await generateExamResults(exam._id);

      const resultMap = new Map(results.map(r => [r.obtainedMarks, r.isPassed]));

      expect(resultMap.get(95)).toBe(true);  // 95% >= 40% passing score
      expect(resultMap.get(85)).toBe(true);  // 85% >= 40% passing score
      expect(resultMap.get(70)).toBe(true);  // 70% >= 40% passing score
      expect(resultMap.get(35)).toBe(false); // 35% < 40% passing score
    });

    it('should set isPublished to false by default', async () => {
      const results = await generateExamResults(exam._id);

      expect(results.every(r => r.isPublished === false)).toBe(true);
    });

    it('should update existing results on subsequent calls', async () => {
      // First generation
      const firstResults = await generateExamResults(exam._id);
      expect(firstResults).toHaveLength(5);

      // Update a submission's marks
      const submission = await ExamSubmissionNew.findOne({ student: students[0]._id });
      submission.obtainedMarks = 80;
      submission.percentage = 80;
      await submission.save();

      // Second generation
      const secondResults = await generateExamResults(exam._id);
      expect(secondResults).toHaveLength(5);

      // Check that the result was updated
      const updatedResult = secondResults.find(r => r.student.toString() === students[0]._id.toString());
      expect(updatedResult.obtainedMarks).toBe(80);
      expect(updatedResult.grade).toBe('A'); // 80% -> A
    });

    it('should return empty array when no graded submissions exist', async () => {
      // Create a new exam with no submissions
      const newExam = await Exam.create({
        title: 'Empty Exam',
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

      const results = await generateExamResults(newExam._id);
      expect(results).toHaveLength(0);
    });

    it('should throw error when exam does not exist', async () => {
      const fakeExamId = new mongoose.Types.ObjectId();

      await expect(generateExamResults(fakeExamId)).rejects.toThrow('Exam not found');
    });
  });
});
