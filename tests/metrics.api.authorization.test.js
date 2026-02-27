/**
 * Integration tests for Metrics API Authorization
 * Tests Requirement 12.5: Metrics API Access
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const LiveSession = require('../models/liveSessionModel');
const User = require('../models/userModel');

describe('Metrics API Authorization - Requirement 12.5', () => {
    let universityUser;
    let instructorUser;
    let studentUser;
    let otherUniversityUser;
    let adminUser;
    let session;
    let universityToken;
    let instructorToken;
    let studentToken;
    let otherUniversityToken;
    let adminToken;

    beforeAll(async () => {
        // Clean up any existing test users
        await User.deleteMany({ 
            email: { 
                $in: [
                    'university-metrics-auth@test.com',
                    'instructor-metrics-auth@test.com', 
                    'student-metrics-auth@test.com',
                    'other-university-metrics-auth@test.com',
                    'admin-metrics-auth@test.com'
                ] 
            } 
        });
        
        // Create test university user
        universityUser = await User.create({
            name: 'Test University Metrics Auth',
            email: 'university-metrics-auth@test.com',
            password: 'password123',
            role: 'university',
            profile: {
                universityName: 'Test University Metrics Auth'
            }
        });

        // Create test instructor user (different from university, but also a university role)
        instructorUser = await User.create({
            name: 'Test Instructor Metrics Auth',
            email: 'instructor-metrics-auth@test.com',
            password: 'password123',
            role: 'university',
            profile: {
                universityName: 'Test Instructor University'
            }
        });

        // Create test student user
        studentUser = await User.create({
            name: 'Test Student Metrics Auth',
            email: 'student-metrics-auth@test.com',
            password: 'password123',
            role: 'student',
            universityId: universityUser._id
        });

        // Create another university user (not associated with the session)
        otherUniversityUser = await User.create({
            name: 'Other University Metrics Auth',
            email: 'other-university-metrics-auth@test.com',
            password: 'password123',
            role: 'university',
            profile: {
                universityName: 'Other University Metrics Auth'
            }
        });

        // Create admin user
        adminUser = await User.create({
            name: 'Admin Metrics Auth',
            email: 'admin-metrics-auth@test.com',
            password: 'password123',
            role: 'admin'
        });

        // Get auth tokens
        const uniRes = await request(app)
            .post('/api/users/login')
            .send({ email: 'university-metrics-auth@test.com', password: 'password123' });
        universityToken = uniRes.body.token;

        const instructorRes = await request(app)
            .post('/api/users/login')
            .send({ email: 'instructor-metrics-auth@test.com', password: 'password123' });
        instructorToken = instructorRes.body.token;

        const studentRes = await request(app)
            .post('/api/users/login')
            .send({ email: 'student-metrics-auth@test.com', password: 'password123' });
        studentToken = studentRes.body.token;

        const otherUniRes = await request(app)
            .post('/api/users/login')
            .send({ email: 'other-university-metrics-auth@test.com', password: 'password123' });
        otherUniversityToken = otherUniRes.body.token;

        const adminRes = await request(app)
            .post('/api/users/login')
            .send({ email: 'admin-metrics-auth@test.com', password: 'password123' });
        adminToken = adminRes.body.token;

        // Create test session with metrics
        session = await LiveSession.create({
            topic: 'Test Metrics Authorization Session',
            description: 'Testing metrics authorization',
            university: universityUser._id,
            instructor: instructorUser._id,
            enrolledStudents: [studentUser._id],
            startTime: new Date(Date.now() + 3600000),
            duration: 60,
            status: 'ended',
            zoom: {
                meetingId: 'test-meeting-auth-123',
                meetingNumber: 123456789,
                passcode: 'encrypted-passcode',
                joinUrl: 'https://zoom.us/j/123456789',
                startUrl: 'https://zoom.us/s/123456789',
                hostEmail: 'instructor-metrics-auth@test.com',
                createdAt: new Date()
            },
            metrics: {
                totalJoins: 15,
                peakViewers: 10,
                avgWatchSecs: 1800
            }
        });
    });

    afterAll(async () => {
        // Clean up
        await User.deleteMany({ 
            email: { 
                $in: [
                    'university-metrics-auth@test.com',
                    'instructor-metrics-auth@test.com',
                    'student-metrics-auth@test.com',
                    'other-university-metrics-auth@test.com',
                    'admin-metrics-auth@test.com'
                ] 
            } 
        });
        await LiveSession.deleteMany({ topic: 'Test Metrics Authorization Session' });
    });

    describe('GET /api/sessions/:id - Single Session Metrics Access', () => {
        it('should return metrics for university owner', async () => {
            const res = await request(app)
                .get(`/api/sessions/${session._id}`)
                .set('Authorization', `Bearer ${universityToken}`)
                .expect(200);

            expect(res.body.metrics).toBeDefined();
            expect(res.body.metrics.totalJoins).toBe(15);
            expect(res.body.metrics.peakViewers).toBe(10);
            expect(res.body.metrics.avgWatchSecs).toBe(1800);
        });

        it('should return metrics for instructor', async () => {
            const res = await request(app)
                .get(`/api/sessions/${session._id}`)
                .set('Authorization', `Bearer ${instructorToken}`)
                .expect(200);

            expect(res.body.metrics).toBeDefined();
            expect(res.body.metrics.totalJoins).toBe(15);
            expect(res.body.metrics.peakViewers).toBe(10);
            expect(res.body.metrics.avgWatchSecs).toBe(1800);
        });

        it('should return metrics for admin', async () => {
            const res = await request(app)
                .get(`/api/sessions/${session._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(res.body.metrics).toBeDefined();
            expect(res.body.metrics.totalJoins).toBe(15);
            expect(res.body.metrics.peakViewers).toBe(10);
            expect(res.body.metrics.avgWatchSecs).toBe(1800);
        });

        it('should NOT return metrics for enrolled student', async () => {
            const res = await request(app)
                .get(`/api/sessions/${session._id}`)
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(200);

            // Student can view the session but not the metrics
            expect(res.body._id).toBeDefined();
            expect(res.body.topic).toBe('Test Metrics Authorization Session');
            expect(res.body.metrics).toBeUndefined();
        });

        it('should deny access to unauthorized university', async () => {
            const res = await request(app)
                .get(`/api/sessions/${session._id}`)
                .set('Authorization', `Bearer ${otherUniversityToken}`)
                .expect(403);

            expect(res.body.message).toContain('Access denied');
        });
    });

    describe('GET /api/sessions - List Sessions Metrics Access', () => {
        it('should return metrics in session list for university', async () => {
            const res = await request(app)
                .get('/api/sessions')
                .set('Authorization', `Bearer ${universityToken}`)
                .expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            
            // Find our test session in the list
            const testSession = res.body.find(s => s._id.toString() === session._id.toString());
            if (testSession) {
                expect(testSession.metrics).toBeDefined();
                expect(testSession.metrics.totalJoins).toBe(15);
                expect(testSession.metrics.peakViewers).toBe(10);
                expect(testSession.metrics.avgWatchSecs).toBe(1800);
            }
        });

        it('should return metrics in session list for admin', async () => {
            const res = await request(app)
                .get('/api/sessions')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            
            // Admin can see all sessions with metrics
            const testSession = res.body.find(s => s._id.toString() === session._id.toString());
            if (testSession) {
                expect(testSession.metrics).toBeDefined();
            }
        });

        it('should NOT return metrics in session list for students', async () => {
            const res = await request(app)
                .get('/api/sessions')
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            
            // Students should see sessions but without metrics
            res.body.forEach(session => {
                expect(session.metrics).toBeUndefined();
            });
        });
    });

    describe('Metrics Data Completeness', () => {
        it('should include all three metrics fields when authorized', async () => {
            const res = await request(app)
                .get(`/api/sessions/${session._id}`)
                .set('Authorization', `Bearer ${universityToken}`)
                .expect(200);

            expect(res.body.metrics).toHaveProperty('totalJoins');
            expect(res.body.metrics).toHaveProperty('peakViewers');
            expect(res.body.metrics).toHaveProperty('avgWatchSecs');
        });

        it('should return numeric values for all metrics', async () => {
            const res = await request(app)
                .get(`/api/sessions/${session._id}`)
                .set('Authorization', `Bearer ${instructorToken}`)
                .expect(200);

            expect(typeof res.body.metrics.totalJoins).toBe('number');
            expect(typeof res.body.metrics.peakViewers).toBe('number');
            expect(typeof res.body.metrics.avgWatchSecs).toBe('number');
        });
    });
});
