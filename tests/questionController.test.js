const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const Question = require('../models/questionModel');
const Exam = require('../models/examModel');
const ExamSubmission = require('../models/examSubmissionModel');
const User = require('../models/userModel');
const Course = require('../models/courseModel');

// Mock authentication middleware
jest.mock('../middleware/authMiddleware', () => ({
    protect: (req, res, next) => {
        req.user = {
            _id: 'mockUserId123',
            role: 'university',
            email: 'test@university.com'
        };
        next();
    },
    authorize: (...roles) => (req, res, next) => {
        if (roles.includes(req.user.role)) {
            next();
        } else {
            res.status(403).json({ message: 'Not authorized' });
        }
    }
}));

describe('Question Controller', () => {
    let mockExam;
    let mockCourse;

    beforeAll(async () => {
        // Setup test data
        mockCourse = {
            _id: new mongoose.Types.ObjectId(),
            title: 'Test Course'
        };

        mockExam = {
            _id: new mongoose.Types.ObjectId(),
            title: 'Test Exam',
            course: mockCourse._id,
            instructor: 'mockUserId123',
            examType: 'online-mcq',
            totalMarks: 0,
            save: jest.fn().mockResolvedValue(true)
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/exams/:examId/questions - createOnlineQuestions', () => {
        it('should create multiple questions successfully', async () => {
            const questions = [
                {
                    questionText: 'What is 2+2?',
                    questionType: 'mcq',
                    options: [
                        { text: '3', isCorrect: false },
                        { text: '4', isCorrect: true },
                        { text: '5', isCorrect: false }
                    ],
                    marks: 5,
                    order: 1
                },
                {
                    questionText: 'Explain photosynthesis',
                    questionType: 'descriptive',
                    marks: 10,
                    order: 2
                }
            ];

            // Mock database operations
            jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
            jest.spyOn(Question, 'find').mockResolvedValue([]);
            jest.spyOn(Question, 'insertMany').mockResolvedValue(
                questions.map((q, i) => ({ ...q, _id: `question${i}`, exam: mockExam._id }))
            );

            const response = await request(app)
                .post(`/api/exams/${mockExam._id}/questions`)
                .send({ questions })
                .expect(201);

            expect(response.body.message).toContain('Successfully created 2 question(s)');
            expect(response.body.questions).toHaveLength(2);
            expect(mockExam.save).toHaveBeenCalled();
        });

        it('should reject questions with invalid data', async () => {
            const invalidQuestions = [
                {
                    questionText: '',  // Empty text
                    questionType: 'mcq',
                    marks: 5,
                    order: 1
                }
            ];

            jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);

            const response = await request(app)
                .post(`/api/exams/${mockExam._id}/questions`)
                .send({ questions: invalidQuestions })
                .expect(400);

            expect(response.body.message).toContain('Validation failed');
        });

        it('should reject MCQ with less than 2 options', async () => {
            const invalidQuestions = [
                {
                    questionText: 'Test question?',
                    questionType: 'mcq',
                    options: [{ text: 'Only one', isCorrect: true }],
                    marks: 5,
                    order: 1
                }
            ];

            jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);

            const response = await request(app)
                .post(`/api/exams/${mockExam._id}/questions`)
                .send({ questions: invalidQuestions })
                .expect(400);

            expect(response.body.errors[0].errors).toContain('MCQ questions must have at least 2 options');
        });

        it('should reject MCQ without exactly one correct option', async () => {
            const invalidQuestions = [
                {
                    questionText: 'Test question?',
                    questionType: 'mcq',
                    options: [
                        { text: 'Option 1', isCorrect: true },
                        { text: 'Option 2', isCorrect: true }  // Two correct options
                    ],
                    marks: 5,
                    order: 1
                }
            ];

            jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);

            const response = await request(app)
                .post(`/api/exams/${mockExam._id}/questions`)
                .send({ questions: invalidQuestions })
                .expect(400);

            expect(response.body.errors[0].errors).toContain('MCQ questions must have exactly one correct option');
        });

        it('should reject duplicate order values', async () => {
            const duplicateOrderQuestions = [
                {
                    questionText: 'Question 1',
                    questionType: 'descriptive',
                    marks: 5,
                    order: 1
                },
                {
                    questionText: 'Question 2',
                    questionType: 'descriptive',
                    marks: 5,
                    order: 1  // Duplicate order
                }
            ];

            jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
            jest.spyOn(Question, 'find').mockResolvedValue([]);

            const response = await request(app)
                .post(`/api/exams/${mockExam._id}/questions`)
                .send({ questions: duplicateOrderQuestions })
                .expect(400);

            expect(response.body.errors[1].errors).toContain('duplicate order 1 within the batch');
        });

        it('should reject questions for PDF-based exams', async () => {
            const pdfExam = { ...mockExam, examType: 'pdf-based' };
            jest.spyOn(Exam, 'findById').mockResolvedValue(pdfExam);

            const response = await request(app)
                .post(`/api/exams/${mockExam._id}/questions`)
                .send({
                    questions: [{
                        questionText: 'Test',
                        questionType: 'descriptive',
                        marks: 5,
                        order: 1
                    }]
                })
                .expect(400);

            expect(response.body.message).toContain('Cannot add online questions to PDF-based exam');
        });
    });

    describe('PUT /api/questions/:questionId - updateQuestion', () => {
        it('should update a question successfully', async () => {
            const mockQuestion = {
                _id: 'question123',
                questionText: 'Old question',
                questionType: 'mcq',
                marks: 5,
                order: 1,
                exam: mockExam,
                save: jest.fn().mockResolvedValue(true)
            };

            jest.spyOn(Question, 'findById').mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockQuestion)
            });
            jest.spyOn(Question, 'findOne').mockResolvedValue(null);
            jest.spyOn(Question, 'find').mockResolvedValue([mockQuestion]);

            const updates = {
                questionText: 'Updated question',
                marks: 10
            };

            const response = await request(app)
                .put('/api/questions/question123')
                .send(updates)
                .expect(200);

            expect(response.body.message).toBe('Question updated successfully');
            expect(mockQuestion.save).toHaveBeenCalled();
        });

        it('should reject update with invalid marks', async () => {
            const mockQuestion = {
                _id: 'question123',
                exam: mockExam
            };

            jest.spyOn(Question, 'findById').mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockQuestion)
            });

            const response = await request(app)
                .put('/api/questions/question123')
                .send({ marks: -5 })
                .expect(400);

            expect(response.body.message).toContain('marks must be a positive number');
        });

        it('should reject update with duplicate order', async () => {
            const mockQuestion = {
                _id: 'question123',
                order: 1,
                exam: mockExam
            };

            const existingQuestion = {
                _id: 'question456',
                order: 2
            };

            jest.spyOn(Question, 'findById').mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockQuestion)
            });
            jest.spyOn(Question, 'findOne').mockResolvedValue(existingQuestion);

            const response = await request(app)
                .put('/api/questions/question123')
                .send({ order: 2 })
                .expect(400);

            expect(response.body.message).toContain('Order 2 is already used by another question');
        });
    });

    describe('DELETE /api/questions/:questionId - deleteQuestion', () => {
        it('should delete a question successfully', async () => {
            const mockQuestion = {
                _id: 'question123',
                marks: 5,
                exam: mockExam,
                deleteOne: jest.fn().mockResolvedValue(true)
            };

            jest.spyOn(Question, 'findById').mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockQuestion)
            });
            jest.spyOn(ExamSubmission, 'findOne').mockResolvedValue(null);
            jest.spyOn(Question, 'find').mockResolvedValue([]);
            jest.spyOn(Exam, 'findByIdAndUpdate').mockResolvedValue(mockExam);

            const response = await request(app)
                .delete('/api/questions/question123')
                .expect(200);

            expect(response.body.message).toBe('Question deleted successfully');
            expect(mockQuestion.deleteOne).toHaveBeenCalled();
        });

        it('should prevent deletion if question is referenced by submissions', async () => {
            const mockQuestion = {
                _id: 'question123',
                exam: mockExam
            };

            const mockSubmission = {
                _id: 'submission123',
                answers: [{ questionId: 'question123' }]
            };

            jest.spyOn(Question, 'findById').mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockQuestion)
            });
            jest.spyOn(ExamSubmission, 'findOne').mockResolvedValue(mockSubmission);
            jest.spyOn(ExamSubmission, 'countDocuments').mockResolvedValue(1);

            const response = await request(app)
                .delete('/api/questions/question123')
                .expect(400);

            expect(response.body.message).toContain('Cannot delete question that is referenced by existing submissions');
            expect(response.body.submissionCount).toBe(1);
        });

        it('should return 404 if question not found', async () => {
            jest.spyOn(Question, 'findById').mockReturnValue({
                populate: jest.fn().mockResolvedValue(null)
            });

            const response = await request(app)
                .delete('/api/questions/nonexistent')
                .expect(404);

            expect(response.body.message).toBe('Question not found');
        });
    });

    describe('GET /api/exams/:examId/questions - getExamQuestions', () => {
        it('should retrieve all questions for an exam', async () => {
            const mockQuestions = [
                {
                    _id: 'q1',
                    questionText: 'Question 1',
                    marks: 5,
                    order: 1
                },
                {
                    _id: 'q2',
                    questionText: 'Question 2',
                    marks: 10,
                    order: 2
                }
            ];

            jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
            jest.spyOn(Question, 'find').mockReturnValue({
                sort: jest.fn().mockResolvedValue(mockQuestions)
            });

            const response = await request(app)
                .get(`/api/exams/${mockExam._id}/questions`)
                .expect(200);

            expect(response.body.totalQuestions).toBe(2);
            expect(response.body.totalMarks).toBe(15);
            expect(response.body.questions).toHaveLength(2);
        });

        it('should return 404 if exam not found', async () => {
            jest.spyOn(Exam, 'findById').mockResolvedValue(null);

            const response = await request(app)
                .get('/api/exams/nonexistent/questions')
                .expect(404);

            expect(response.body.message).toBe('Exam not found');
        });
    });
});
