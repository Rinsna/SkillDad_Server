const mongoose = require('mongoose');
const ProgressTrackerService = require('../services/ProgressTrackerService');
const Progress = require('../models/progressModel');
const Course = require('../models/courseModel');
const InteractiveContent = require('../models/interactiveContentModel');

// Mock data
const mockUserId = new mongoose.Types.ObjectId();
const mockCourseId = new mongoose.Types.ObjectId();
const mockContentId = new mongoose.Types.ObjectId();
const mockModuleId = new mongoose.Types.ObjectId();

describe('ProgressTrackerService', () => {
    beforeAll(async () => {
        // Connect to test database
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/skilldad_test');
        }
    }, 10000);

    afterAll(async () => {
        // Clean up and close connection
        await Progress.deleteMany({});
        await Course.deleteMany({});
        await InteractiveContent.deleteMany({});
        await mongoose.connection.close();
    }, 10000);

    beforeEach(async () => {
        // Clean up before each test
        await Progress.deleteMany({});
        await Course.deleteMany({});
        await InteractiveContent.deleteMany({});
    });

    describe('recordCompletion', () => {
        it('should create new progress record for exercise submission', async () => {
            const mockSubmission = {
                user: mockUserId,
                course: mockCourseId,
                content: mockContentId,
                contentType: 'exercise',
                score: 85,
                attemptNumber: 1,
                submittedAt: new Date()
            };

            const progress = await ProgressTrackerService.recordCompletion(mockSubmission);

            expect(progress).toBeDefined();
            expect(progress.user.toString()).toBe(mockUserId.toString());
            expect(progress.course.toString()).toBe(mockCourseId.toString());
            expect(progress.completedExercises).toHaveLength(1);
            expect(progress.completedExercises[0].bestScore).toBe(85);
            expect(progress.completedExercises[0].isCompleted).toBe(true);
        });

        it('should update existing exercise progress with better score', async () => {
            // First submission
            const firstSubmission = {
                user: mockUserId,
                course: mockCourseId,
                content: mockContentId,
                contentType: 'exercise',
                score: 60,
                attemptNumber: 1,
                submittedAt: new Date()
            };

            await ProgressTrackerService.recordCompletion(firstSubmission);

            // Second submission with better score
            const secondSubmission = {
                user: mockUserId,
                course: mockCourseId,
                content: mockContentId,
                contentType: 'exercise',
                score: 90,
                attemptNumber: 2,
                submittedAt: new Date()
            };

            const progress = await ProgressTrackerService.recordCompletion(secondSubmission);

            expect(progress.completedExercises).toHaveLength(1);
            expect(progress.completedExercises[0].bestScore).toBe(90);
            expect(progress.completedExercises[0].attempts).toBe(2);
            expect(progress.completedExercises[0].isCompleted).toBe(true);
        });

        it('should record practice completion', async () => {
            const mockSubmission = {
                user: mockUserId,
                course: mockCourseId,
                content: mockContentId,
                contentType: 'practice',
                score: 100,
                attemptNumber: 1,
                submittedAt: new Date()
            };

            const progress = await ProgressTrackerService.recordCompletion(mockSubmission);

            expect(progress.completedPractices).toHaveLength(1);
            expect(progress.completedPractices[0].toString()).toBe(mockContentId.toString());
        });

        it('should record quiz progress with passing status', async () => {
            const mockSubmission = {
                user: mockUserId,
                course: mockCourseId,
                content: mockContentId,
                contentType: 'quiz',
                score: 80,
                isPassing: true,
                attemptNumber: 1,
                submittedAt: new Date()
            };

            const progress = await ProgressTrackerService.recordCompletion(mockSubmission);

            expect(progress.completedQuizzes).toHaveLength(1);
            expect(progress.completedQuizzes[0].bestScore).toBe(80);
            expect(progress.completedQuizzes[0].isPassing).toBe(true);
        });
    });

    describe('calculateCourseProgress', () => {
        it('should return 0 for course with no progress', async () => {
            // Create a mock course
            const course = await Course.create({
                _id: mockCourseId,
                title: 'Test Course',
                description: 'Test Description',
                category: 'Test',
                price: 0,
                modules: []
            });

            const courseProgress = await ProgressTrackerService.calculateCourseProgress(mockUserId, mockCourseId);

            expect(courseProgress).toBe(0);
        });

        it('should calculate weighted progress correctly', async () => {
            // Create interactive content
            const exercise = await InteractiveContent.create({
                _id: mockContentId,
                type: 'exercise',
                title: 'Test Exercise',
                description: 'Test',
                instructions: 'Test',
                attemptsAllowed: -1,
                showSolutionAfter: 'submission',
                questions: [{
                    questionType: 'multiple-choice',
                    questionText: 'Test?',
                    points: 10,
                    options: ['A', 'B'],
                    correctAnswer: 'A'
                }]
            });

            // Create course with content
            const course = await Course.create({
                _id: mockCourseId,
                title: 'Test Course',
                description: 'Test Description',
                category: 'Test',
                price: 0,
                modules: [{
                    _id: mockModuleId,
                    title: 'Module 1',
                    videos: [{
                        title: 'Video 1',
                        url: 'http://example.com/video1'
                    }],
                    interactiveContent: [mockContentId]
                }]
            });

            // Create progress with completed video and exercise
            await Progress.create({
                user: mockUserId,
                course: mockCourseId,
                completedVideos: [course.modules[0].videos[0]._id],
                completedExercises: [{
                    content: mockContentId,
                    attempts: 1,
                    bestScore: 100,
                    lastAttemptAt: new Date(),
                    isCompleted: true
                }],
                completedPractices: [],
                completedQuizzes: [],
                projectSubmissions: []
            });

            const courseProgress = await ProgressTrackerService.calculateCourseProgress(mockUserId, mockCourseId);

            // 1 video (100% of videos) * 0.4 = 40%
            // 1 exercise (100% of exercises) * 0.2 = 20%
            // 0 practices * 0.15 = 0%
            // 0 quizzes * 0.25 = 0%
            // Total = 60%
            expect(courseProgress).toBe(60);
        });
    });

    describe('getProgress', () => {
        it('should return empty progress for user with no progress', async () => {
            const progress = await ProgressTrackerService.getProgress(mockUserId, mockCourseId);

            expect(progress).toBeDefined();
            expect(progress.completedVideos).toEqual([]);
            expect(progress.completedExercises).toEqual([]);
            expect(progress.courseProgress).toBe(0);
        });
    });
});
