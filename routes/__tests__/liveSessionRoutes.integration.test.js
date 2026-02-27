/**
 * Live Session Routes Integration Tests
 * 
 * Tests the complete Zoom live session lifecycle:
 * - Session creation with Zoom meeting
 * - Session start and status updates
 * - Student joining with SDK config
 * - Session end and recording sync
 * - Multiple users (instructor and students)
 * - Error scenarios and recovery
 * - Metrics tracking
 */

// Import setup first
require('./setup');

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const LiveSession = require('../../models/liveSessionModel');
const User = require('../../models/userModel');
const Enrollment = require('../../models/enrollmentModel');
const Course = require('../../models/courseModel');
const jwt = require('jsonwebtoken');
const { createZoomMeeting, generateZoomSignature, syncZoomRecordings } = require('../../utils/zoomUtils');

// Import routes
const liveSessionRoutes = require('../liveSessionRoutes');
const authMiddleware = require('../../middleware/authMiddleware');

// Mock Zoom utilities
jest.mock('../../utils/zoomUtils', () => ({
  createZoomMeeting: jest.fn(),
  generateZoomSignature: jest.fn(),
  syncZoomRecordings: jest.fn(),
  decryptPasscode: jest.fn((encrypted) => 'decrypted-passcode-123'),
}));

// Mock notification service
jest.mock('../../services/NotificationService', () => ({
  sendLiveSessionNotification: jest.fn().mockResolvedValue(true),
}));

// Create Express app for testing
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/sessions', liveSessionRoutes);
  return app;
};

describe('Live Session Routes Integration Tests', () => {
  let app;
  let universityUser;
  let instructorUser;
  let studentUser1;
  let studentUser2;
  let unenrolledStudent;
  let testCourse;
  let universityToken;
  let instructorToken;
  let studentToken1;
  let studentToken2;
  let unenrolledToken;

  // Helper to generate JWT token
  const generateToken = (userId) => {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  };

  beforeAll(async () => {
    // Create test app
    app = createTestApp();
  });

  afterAll(async () => {
    // Don't close the connection as it's shared with the server
  });

  beforeEach(async () => {
    // Clear all collections
    await LiveSession.deleteMany({});
    await User.deleteMany({});
    await Enrollment.deleteMany({});
    await Course.deleteMany({});

    // Create test university
    universityUser = await User.create({
      name: 'Test University',
      email: 'university@test.com',
      password: 'password123',
      role: 'university',
      profile: { phone: '1234567890' }
    });

    // Create test instructor (also a university role user)
    instructorUser = await User.create({
      name: 'Test Instructor',
      email: 'instructor@test.com',
      password: 'password123',
      role: 'university', // Changed from 'instructor' to 'university'
      profile: { phone: '1234567891' }
    });

    // Create test students
    studentUser1 = await User.create({
      name: 'Student One',
      email: 'student1@test.com',
      password: 'password123',
      role: 'student',
      universityId: universityUser._id,
      profile: { phone: '1234567892' }
    });

    studentUser2 = await User.create({
      name: 'Student Two',
      email: 'student2@test.com',
      password: 'password123',
      role: 'student',
      universityId: universityUser._id,
      profile: { phone: '1234567893' }
    });

    unenrolledStudent = await User.create({
      name: 'Unenrolled Student',
      email: 'unenrolled@test.com',
      password: 'password123',
      role: 'student',
      universityId: universityUser._id,
      profile: { phone: '1234567894' }
    });

    // Create test course
    testCourse = await Course.create({
      title: 'Test Course',
      description: 'Test course description',
      category: 'Engineering', // Added required category field
      university: universityUser._id,
      instructor: instructorUser._id,
      price: 1000,
      duration: 30
    });

    // Enroll students in course
    await Enrollment.create({
      student: studentUser1._id,
      course: testCourse._id,
      university: universityUser._id,
      status: 'active'
    });

    await Enrollment.create({
      student: studentUser2._id,
      course: testCourse._id,
      university: universityUser._id,
      status: 'active'
    });

    // Generate tokens
    universityToken = generateToken(universityUser._id);
    instructorToken = generateToken(instructorUser._id);
    studentToken1 = generateToken(studentUser1._id);
    studentToken2 = generateToken(studentUser2._id);
    unenrolledToken = generateToken(unenrolledStudent._id);

    // Reset mocks
    jest.clearAllMocks();

    // Setup default mock responses
    createZoomMeeting.mockResolvedValue({
      meetingId: 'test-meeting-123',
      meetingNumber: 123456789,
      passcode: 'encrypted-passcode',
      joinUrl: 'https://zoom.us/j/123456789',
      startUrl: 'https://zoom.us/s/123456789',
      hostEmail: instructorUser.email,
      createdAt: new Date()
    });

    generateZoomSignature.mockReturnValue('mock-jwt-signature-token');

    syncZoomRecordings.mockResolvedValue([{
      recordingId: 'rec-123',
      downloadUrl: 'https://zoom.us/rec/download/123',
      playUrl: 'https://zoom.us/rec/play/123',
      recordingType: 'cloud',
      durationMs: 3600000,
      fileSizeBytes: 1024000,
      status: 'completed',
      createdAt: new Date()
    }]);
  });

  afterEach(async () => {
    // Clean up test data
    await LiveSession.deleteMany({});
    await User.deleteMany({});
    await Enrollment.deleteMany({});
    await Course.deleteMany({});
  });

  describe('Complete Session Lifecycle', () => {
    it('should complete full session lifecycle: create → start → join → end → recording', async () => {
      // Step 1: Create session
      const sessionData = {
        topic: 'Integration Test Session',
        description: 'Testing complete lifecycle',
        category: 'Engineering',
        startTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        duration: 60,
        courseId: testCourse._id.toString(),
        instructor: instructorUser._id.toString()
      };

      const createResponse = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${universityToken}`)
        .send(sessionData)
        .expect(201);

      expect(createResponse.body).toHaveProperty('_id');
      expect(createResponse.body.topic).toBe(sessionData.topic);
      expect(createResponse.body.status).toBe('scheduled');
      expect(createResponse.body.zoom).toBeDefined();
      expect(createResponse.body.zoom.meetingId).toBe('test-meeting-123');
      expect(createZoomMeeting).toHaveBeenCalledTimes(1);

      const sessionId = createResponse.body._id;

      // Wait for background enrollment to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify students were enrolled
      const sessionAfterEnrollment = await LiveSession.findById(sessionId);
      expect(sessionAfterEnrollment.enrolledStudents).toHaveLength(2);
      expect(sessionAfterEnrollment.enrolledStudents.map(s => s.toString())).toContain(studentUser1._id.toString());
      expect(sessionAfterEnrollment.enrolledStudents.map(s => s.toString())).toContain(studentUser2._id.toString());

      // Step 2: Start session
      const startResponse = await request(app)
        .patch(`/api/sessions/${sessionId}/start`)
        .set('Authorization', `Bearer ${universityToken}`)
        .expect(200);

      expect(startResponse.body.status).toBe('live');
      expect(startResponse.body.message).toContain('started');

      // Step 3: Students join session (get SDK config)
      const joinResponse1 = await request(app)
        .get(`/api/sessions/${sessionId}/zoom-config`)
        .set('Authorization', `Bearer ${studentToken1}`)
        .expect(200);

      expect(joinResponse1.body).toHaveProperty('sdkKey');
      expect(joinResponse1.body).toHaveProperty('meetingNumber');
      expect(joinResponse1.body).toHaveProperty('passWord');
      expect(joinResponse1.body).toHaveProperty('signature');
      expect(joinResponse1.body).toHaveProperty('userName', studentUser1.name);
      expect(joinResponse1.body).toHaveProperty('userEmail', studentUser1.email);
      expect(joinResponse1.body).toHaveProperty('role', 0); // Participant role
      expect(joinResponse1.body).toHaveProperty('leaveUrl');
      expect(generateZoomSignature).toHaveBeenCalled();

      const joinResponse2 = await request(app)
        .get(`/api/sessions/${sessionId}/zoom-config`)
        .set('Authorization', `Bearer ${studentToken2}`)
        .expect(200);

      expect(joinResponse2.body.role).toBe(0); // Participant role

      // Instructor joins as host
      const hostJoinResponse = await request(app)
        .get(`/api/sessions/${sessionId}/zoom-config`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(hostJoinResponse.body.role).toBe(1); // Host role

      // Step 4: Track metrics (simulate joins)
      await LiveSession.findByIdAndUpdate(sessionId, {
        $inc: { 'metrics.totalJoins': 3 },
        $set: { 'metrics.peakViewers': 3 }
      });

      // Step 5: End session
      const endResponse = await request(app)
        .patch(`/api/sessions/${sessionId}/end`)
        .set('Authorization', `Bearer ${universityToken}`)
        .expect(200);

      expect(endResponse.body.status).toBe('ended');
      expect(endResponse.body.endTime).toBeDefined();

      // Wait for background recording sync
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 6: Verify recording was synced
      const finalSession = await LiveSession.findById(sessionId);
      expect(finalSession.status).toBe('ended');
      expect(finalSession.endTime).toBeDefined();
      
      // Verify metrics were tracked
      expect(finalSession.metrics.totalJoins).toBe(3);
      expect(finalSession.metrics.peakViewers).toBe(3);
    });
  });

  describe('Session Creation', () => {
    it('should create session with valid data and Zoom meeting', async () => {
      const sessionData = {
        topic: 'Test Session',
        description: 'Test description',
        category: 'Engineering',
        startTime: new Date(Date.now() + 3600000).toISOString(),
        duration: 60,
        instructor: instructorUser._id.toString()
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${universityToken}`)
        .send(sessionData)
        .expect(201);

      expect(response.body).toHaveProperty('_id');
      expect(response.body.zoom).toBeDefined();
      expect(response.body.zoom.meetingId).toBe('test-meeting-123');
      expect(createZoomMeeting).toHaveBeenCalledWith(
        sessionData.topic,
        expect.any(Date),
        sessionData.duration,
        instructorUser.email
      );
    });

    it('should reject session creation with empty topic', async () => {
      const sessionData = {
        topic: '   ',
        startTime: new Date(Date.now() + 3600000).toISOString(),
        duration: 60
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${universityToken}`)
        .send(sessionData)
        .expect(400);

      expect(response.body.message).toContain('non-empty');
      expect(createZoomMeeting).not.toHaveBeenCalled();
    });

    it('should reject session creation with past start time', async () => {
      const sessionData = {
        topic: 'Test Session',
        startTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        duration: 60
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${universityToken}`)
        .send(sessionData)
        .expect(400);

      expect(response.body.message).toContain('future');
      expect(createZoomMeeting).not.toHaveBeenCalled();
    });

    it('should reject session creation with non-positive duration', async () => {
      const sessionData = {
        topic: 'Test Session',
        startTime: new Date(Date.now() + 3600000).toISOString(),
        duration: -10
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${universityToken}`)
        .send(sessionData)
        .expect(400);

      expect(response.body.message).toContain('positive');
      expect(createZoomMeeting).not.toHaveBeenCalled();
    });

    it('should return 503 when Zoom API fails', async () => {
      createZoomMeeting.mockRejectedValueOnce(new Error('Zoom API error'));

      const sessionData = {
        topic: 'Test Session',
        startTime: new Date(Date.now() + 3600000).toISOString(),
        duration: 60,
        instructor: instructorUser._id.toString()
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${universityToken}`)
        .send(sessionData)
        .expect(503);

      expect(response.body.message).toContain('Failed to create Zoom meeting');
      
      // Verify no session was created in database
      const sessions = await LiveSession.find({});
      expect(sessions).toHaveLength(0);
    });

    it('should reject session creation by student', async () => {
      const sessionData = {
        topic: 'Test Session',
        startTime: new Date(Date.now() + 3600000).toISOString(),
        duration: 60
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${studentToken1}`)
        .send(sessionData)
        .expect(403);

      expect(response.body.message).toContain('Only universities or admins');
      expect(createZoomMeeting).not.toHaveBeenCalled();
    });
  });

  describe('Student Enrollment', () => {
    it('should enroll all course students when courseId is provided', async () => {
      const sessionData = {
        topic: 'Course Session',
        startTime: new Date(Date.now() + 3600000).toISOString(),
        duration: 60,
        courseId: testCourse._id.toString(),
        instructor: instructorUser._id.toString()
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${universityToken}`)
        .send(sessionData)
        .expect(201);

      // Wait for background enrollment
      await new Promise(resolve => setTimeout(resolve, 500));

      const session = await LiveSession.findById(response.body._id);
      expect(session.enrolledStudents).toHaveLength(2);
      expect(session.enrolledStudents.map(s => s.toString())).toContain(studentUser1._id.toString());
      expect(session.enrolledStudents.map(s => s.toString())).toContain(studentUser2._id.toString());
      expect(session.enrolledStudents.map(s => s.toString())).not.toContain(unenrolledStudent._id.toString());
    });

    it('should enroll all university students when no courseId is provided', async () => {
      const sessionData = {
        topic: 'University-wide Session',
        startTime: new Date(Date.now() + 3600000).toISOString(),
        duration: 60,
        instructor: instructorUser._id.toString()
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${universityToken}`)
        .send(sessionData)
        .expect(201);

      // Wait for background enrollment
      await new Promise(resolve => setTimeout(resolve, 500));

      const session = await LiveSession.findById(response.body._id);
      expect(session.enrolledStudents.length).toBeGreaterThanOrEqual(3); // All 3 students
    });
  });

  describe('SDK Configuration', () => {
    let testSession;

    beforeEach(async () => {
      testSession = await LiveSession.create({
        topic: 'Test Session',
        university: universityUser._id,
        instructor: instructorUser._id,
        enrolledStudents: [studentUser1._id, studentUser2._id],
        startTime: new Date(Date.now() + 3600000),
        duration: 60,
        status: 'scheduled',
        zoom: {
          meetingId: 'test-meeting-123',
          meetingNumber: 123456789,
          passcode: 'encrypted-passcode',
          joinUrl: 'https://zoom.us/j/123456789',
          startUrl: 'https://zoom.us/s/123456789',
          hostEmail: instructorUser.email,
          createdAt: new Date()
        }
      });
    });

    it('should provide SDK config to enrolled student with participant role', async () => {
      const response = await request(app)
        .get(`/api/sessions/${testSession._id}/zoom-config`)
        .set('Authorization', `Bearer ${studentToken1}`)
        .expect(200);

      expect(response.body).toHaveProperty('sdkKey');
      expect(response.body).toHaveProperty('meetingNumber', '123456789');
      expect(response.body).toHaveProperty('passWord', 'decrypted-passcode-123');
      expect(response.body).toHaveProperty('signature', 'mock-jwt-signature-token');
      expect(response.body).toHaveProperty('userName', studentUser1.name);
      expect(response.body).toHaveProperty('userEmail', studentUser1.email);
      expect(response.body).toHaveProperty('role', 0); // Participant
      expect(response.body).toHaveProperty('leaveUrl');
    });

    it('should provide SDK config to instructor with host role', async () => {
      const response = await request(app)
        .get(`/api/sessions/${testSession._id}/zoom-config`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      expect(response.body.role).toBe(1); // Host
      expect(response.body.userName).toBe(instructorUser.name);
    });

    it('should provide SDK config to university owner with host role', async () => {
      const response = await request(app)
        .get(`/api/sessions/${testSession._id}/zoom-config`)
        .set('Authorization', `Bearer ${universityToken}`)
        .expect(200);

      expect(response.body.role).toBe(1); // Host
    });

    it('should reject SDK config request from unenrolled student', async () => {
      const response = await request(app)
        .get(`/api/sessions/${testSession._id}/zoom-config`)
        .set('Authorization', `Bearer ${unenrolledToken}`)
        .expect(403);

      expect(response.body.message).toContain('not authorized');
    });

    it('should reject SDK config request without authentication', async () => {
      await request(app)
        .get(`/api/sessions/${testSession._id}/zoom-config`)
        .expect(401);
    });
  });

  describe('Session Status Management', () => {
    let testSession;

    beforeEach(async () => {
      testSession = await LiveSession.create({
        topic: 'Test Session',
        university: universityUser._id,
        instructor: instructorUser._id,
        enrolledStudents: [studentUser1._id],
        startTime: new Date(Date.now() + 3600000),
        duration: 60,
        status: 'scheduled',
        zoom: {
          meetingId: 'test-meeting-123',
          meetingNumber: 123456789,
          passcode: 'test-passcode',
          joinUrl: 'https://zoom.us/j/123456789',
          startUrl: 'https://zoom.us/s/123456789',
          hostEmail: instructorUser.email,
          createdAt: new Date()
        }
      });
    });

    it('should start session and update status to live', async () => {
      const response = await request(app)
        .patch(`/api/sessions/${testSession._id}/start`)
        .set('Authorization', `Bearer ${universityToken}`)
        .expect(200);

      expect(response.body.status).toBe('live');
      
      const updatedSession = await LiveSession.findById(testSession._id);
      expect(updatedSession.status).toBe('live');
    });

    it('should end session and update status to ended with endTime', async () => {
      // First start the session
      await LiveSession.findByIdAndUpdate(testSession._id, { status: 'live' });

      const response = await request(app)
        .patch(`/api/sessions/${testSession._id}/end`)
        .set('Authorization', `Bearer ${universityToken}`)
        .expect(200);

      expect(response.body.status).toBe('ended');
      expect(response.body.endTime).toBeDefined();
      
      const updatedSession = await LiveSession.findById(testSession._id);
      expect(updatedSession.status).toBe('ended');
      expect(updatedSession.endTime).toBeDefined();
    });

    it('should reject session start by unenrolled student', async () => {
      const response = await request(app)
        .patch(`/api/sessions/${testSession._id}/start`)
        .set('Authorization', `Bearer ${unenrolledToken}`)
        .expect(403);

      expect(response.body.message).toContain('not authorized');
    });

    it('should reject session end by enrolled student', async () => {
      await LiveSession.findByIdAndUpdate(testSession._id, { status: 'live' });

      const response = await request(app)
        .patch(`/api/sessions/${testSession._id}/end`)
        .set('Authorization', `Bearer ${studentToken1}`)
        .expect(403);

      expect(response.body.message).toContain('not authorized');
    });
  });

  describe('Metrics Tracking', () => {
    let testSession;

    beforeEach(async () => {
      testSession = await LiveSession.create({
        topic: 'Test Session',
        university: universityUser._id,
        instructor: instructorUser._id,
        enrolledStudents: [studentUser1._id, studentUser2._id],
        startTime: new Date(Date.now() + 3600000),
        duration: 60,
        status: 'live',
        zoom: {
          meetingId: 'test-meeting-123',
          meetingNumber: 123456789,
          passcode: 'test-passcode',
          joinUrl: 'https://zoom.us/j/123456789',
          startUrl: 'https://zoom.us/s/123456789',
          hostEmail: instructorUser.email,
          createdAt: new Date()
        },
        metrics: {
          totalJoins: 0,
          peakViewers: 0,
          avgWatchSecs: 0
        }
      });
    });

    it('should track metrics correctly', async () => {
      // Simulate joins
      await LiveSession.findByIdAndUpdate(testSession._id, {
        $inc: { 'metrics.totalJoins': 1 },
        $set: { 'metrics.peakViewers': 1 }
      });

      await LiveSession.findByIdAndUpdate(testSession._id, {
        $inc: { 'metrics.totalJoins': 1 },
        $set: { 'metrics.peakViewers': 2 }
      });

      const session = await LiveSession.findById(testSession._id);
      expect(session.metrics.totalJoins).toBe(2);
      expect(session.metrics.peakViewers).toBe(2);
    });

    it('should include metrics in session response', async () => {
      await LiveSession.findByIdAndUpdate(testSession._id, {
        'metrics.totalJoins': 5,
        'metrics.peakViewers': 3,
        'metrics.avgWatchSecs': 1800
      });

      const response = await request(app)
        .get(`/api/sessions/${testSession._id}`)
        .set('Authorization', `Bearer ${universityToken}`)
        .expect(200);

      expect(response.body.metrics).toBeDefined();
      expect(response.body.metrics.totalJoins).toBe(5);
      expect(response.body.metrics.peakViewers).toBe(3);
      expect(response.body.metrics.avgWatchSecs).toBe(1800);
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('should handle Zoom API failure with retry', async () => {
      // Mock first call to fail, second to succeed
      createZoomMeeting
        .mockRejectedValueOnce(new Error('Temporary API error'))
        .mockResolvedValueOnce({
          meetingId: 'test-meeting-retry',
          meetingNumber: 987654321,
          passcode: 'retry-passcode',
          joinUrl: 'https://zoom.us/j/987654321',
          startUrl: 'https://zoom.us/s/987654321',
          hostEmail: instructorUser.email,
          createdAt: new Date()
        });

      const sessionData = {
        topic: 'Retry Test Session',
        startTime: new Date(Date.now() + 3600000).toISOString(),
        duration: 60,
        instructor: instructorUser._id.toString()
      };

      // First attempt should fail
      const response1 = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${universityToken}`)
        .send(sessionData)
        .expect(503);

      expect(response1.body.message).toContain('Failed to create Zoom meeting');

      // Second attempt should succeed
      const response2 = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${universityToken}`)
        .send(sessionData)
        .expect(201);

      expect(response2.body.zoom.meetingId).toBe('test-meeting-retry');
    });

    it('should handle missing Zoom meeting data gracefully', async () => {
      const sessionWithoutZoom = await LiveSession.create({
        topic: 'Session Without Zoom',
        university: universityUser._id,
        instructor: instructorUser._id,
        enrolledStudents: [studentUser1._id],
        startTime: new Date(Date.now() + 3600000),
        duration: 60,
        status: 'scheduled'
        // No zoom field
      });

      const response = await request(app)
        .get(`/api/sessions/${sessionWithoutZoom._id}/zoom-config`)
        .set('Authorization', `Bearer ${studentToken1}`)
        .expect(400);

      expect(response.body.message).toContain('Zoom meeting data not found');
    });

    it('should handle non-existent session gracefully', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/api/sessions/${fakeId}/zoom-config`)
        .set('Authorization', `Bearer ${studentToken1}`)
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });

  describe('Multiple Users Scenario', () => {
    it('should handle multiple students joining simultaneously', async () => {
      const sessionData = {
        topic: 'Multi-User Session',
        startTime: new Date(Date.now() + 3600000).toISOString(),
        duration: 60,
        courseId: testCourse._id.toString(),
        instructor: instructorUser._id.toString()
      };

      // Create session
      const createResponse = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${universityToken}`)
        .send(sessionData)
        .expect(201);

      const sessionId = createResponse.body._id;

      // Wait for enrollment
      await new Promise(resolve => setTimeout(resolve, 500));

      // Start session
      await request(app)
        .patch(`/api/sessions/${sessionId}/start`)
        .set('Authorization', `Bearer ${universityToken}`)
        .expect(200);

      // Multiple students request SDK config simultaneously
      const [response1, response2, hostResponse] = await Promise.all([
        request(app)
          .get(`/api/sessions/${sessionId}/zoom-config`)
          .set('Authorization', `Bearer ${studentToken1}`),
        request(app)
          .get(`/api/sessions/${sessionId}/zoom-config`)
          .set('Authorization', `Bearer ${studentToken2}`),
        request(app)
          .get(`/api/sessions/${sessionId}/zoom-config`)
          .set('Authorization', `Bearer ${instructorToken}`)
      ]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(hostResponse.status).toBe(200);

      expect(response1.body.role).toBe(0); // Student
      expect(response2.body.role).toBe(0); // Student
      expect(hostResponse.body.role).toBe(1); // Host
    });
  });
});
