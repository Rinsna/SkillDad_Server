const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const LiveSession = require('../models/liveSessionModel');
const User = require('../models/userModel');
const redisCache = require('../utils/redisCache');

describe('Live Session Metrics Tracking', () => {
    let universityUser;
    let studentUser;
    let session;
    let universityToken;
    let studentToken;

    beforeAll(async () => {
        // Clean up any existing test users first
        await User.deleteMany({ email: { $in: ['university-metrics@test.com', 'student-metrics@test.com'] } });
        
        // Create test university user
        universityUser = await User.create({
            name: 'Test University Metrics',
            email: 'university-metrics@test.com',
            password: 'password123',
            role: 'university',
            profile: {
                universityName: 'Test University Metrics'
            }
        });

        // Create test student user
        studentUser = await User.create({
            name: 'Test Student Metrics',
            email: 'student-metrics@test.com',
            password: 'password123',
            role: 'student',
            universityId: universityUser._id
        });

        // Get auth tokens
        const uniRes = await request(app)
            .post('/api/users/login')
            .send({ email: 'university-metrics@test.com', password: 'password123' });
        universityToken = uniRes.body.token;

        const studentRes = await request(app)
            .post('/api/users/login')
            .send({ email: 'student-metrics@test.com', password: 'password123' });
        studentToken = studentRes.body.token;

        // Create test session
        session = await LiveSession.create({
            topic: 'Test Metrics Session',
            description: 'Testing metrics tracking',
            university: universityUser._id,
            instructor: universityUser._id,
            enrolledStudents: [studentUser._id],
            startTime: new Date(Date.now() + 3600000), // 1 hour from now
            duration: 60,
            status: 'live',
            zoom: {
                meetingId: 'test-meeting-123',
                meetingNumber: 123456789,
                passcode: 'encrypted-passcode',
                joinUrl: 'https://zoom.us/j/123456789',
                startUrl: 'https://zoom.us/s/123456789',
                hostEmail: 'university-metrics@test.com',
                createdAt: new Date()
            },
            metrics: {
                totalJoins: 0,
                peakViewers: 0,
                avgWatchSecs: 0
            }
        });
    });

    afterAll(async () => {
        // Clean up
        await User.deleteMany({ email: { $in: ['university-metrics@test.com', 'student-metrics@test.com'] } });
        await LiveSession.deleteMany({ topic: 'Test Metrics Session' });
        
        // Clean up Redis keys
        if (session && session._id) {
            const r = redisCache.getRedis();
            if (r) {
                const keys = await r.keys(`session:${session._id}:*`);
                if (keys.length > 0) {
                    await r.del(keys);
                }
            }
        }
    });

    describe('POST /api/sessions/:id/join', () => {
        it('should increment totalJoins counter when student joins', async () => {
            const res = await request(app)
                .post(`/api/sessions/${session._id}/join`)
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(200);

            expect(res.body.totalJoins).toBe(1);
            expect(res.body.message).toBe('Join tracked successfully');

            // Verify in database
            const updatedSession = await LiveSession.findById(session._id);
            expect(updatedSession.metrics.totalJoins).toBe(1);
        });

        it('should track peak viewers correctly', async () => {
            const res = await request(app)
                .post(`/api/sessions/${session._id}/join`)
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(200);

            expect(res.body.peakViewers).toBeGreaterThanOrEqual(1);

            // Verify in database
            const updatedSession = await LiveSession.findById(session._id);
            expect(updatedSession.metrics.peakViewers).toBeGreaterThanOrEqual(1);
        });

        it('should reject unauthorized users', async () => {
            // Create unauthorized user
            const unauthorizedUser = await User.create({
                name: 'Unauthorized User',
                email: 'unauthorized@test.com',
                password: 'password123',
                role: 'student',
                universityId: new mongoose.Types.ObjectId() // Different university
            });

            const authRes = await request(app)
                .post('/api/users/login')
                .send({ email: 'unauthorized@test.com', password: 'password123' });

            const res = await request(app)
                .post(`/api/sessions/${session._id}/join`)
                .set('Authorization', `Bearer ${authRes.body.token}`)
                .expect(403);

            expect(res.body.message).toContain('Access denied');

            // Clean up
            await User.deleteOne({ email: 'unauthorized@test.com' });
        });
    });

    describe('POST /api/sessions/:id/leave', () => {
        it('should track watch time when student leaves', async () => {
            // First join
            await request(app)
                .post(`/api/sessions/${session._id}/join`)
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(200);

            // Wait a bit to simulate watch time
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Then leave
            const res = await request(app)
                .post(`/api/sessions/${session._id}/leave`)
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(200);

            expect(res.body.message).toBe('Leave tracked successfully');

            // Verify watch time was stored in Redis
            const r = redisCache.getRedis();
            if (r) {
                const watchTimesKey = `session:${session._id}:watchtimes`;
                const watchTime = await r.hGet(watchTimesKey, studentUser._id.toString());
                expect(watchTime).toBeDefined();
                expect(parseInt(watchTime)).toBeGreaterThanOrEqual(1);
            }
        });
    });

    describe('Metrics Finalization', () => {
        it('should calculate average watch time when session ends', async () => {
            // Create a new session for this test
            const testSession = await LiveSession.create({
                topic: 'Test Finalization Session',
                description: 'Testing metrics finalization',
                university: universityUser._id,
                instructor: universityUser._id,
                enrolledStudents: [studentUser._id],
                startTime: new Date(),
                duration: 60,
                status: 'live',
                zoom: {
                    meetingId: 'test-meeting-456',
                    meetingNumber: 987654321,
                    passcode: 'encrypted-passcode',
                    joinUrl: 'https://zoom.us/j/987654321',
                    startUrl: 'https://zoom.us/s/987654321',
                    hostEmail: 'university-metrics@test.com',
                    createdAt: new Date()
                },
                metrics: {
                    totalJoins: 0,
                    peakViewers: 0,
                    avgWatchSecs: 0
                }
            });

            // Simulate join
            await request(app)
                .post(`/api/sessions/${testSession._id}/join`)
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(200);

            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Simulate leave
            await request(app)
                .post(`/api/sessions/${testSession._id}/leave`)
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(200);

            // End session (this should finalize metrics)
            await request(app)
                .put(`/api/sessions/${testSession._id}/end`)
                .set('Authorization', `Bearer ${universityToken}`)
                .expect(200);

            // Wait for background job to complete
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify metrics were finalized
            const finalizedSession = await LiveSession.findById(testSession._id);
            expect(finalizedSession.metrics.avgWatchSecs).toBeGreaterThanOrEqual(1);
            expect(finalizedSession.status).toBe('ended');

            // Clean up
            await LiveSession.deleteOne({ _id: testSession._id });
        });
    });
});
