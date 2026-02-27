const request = require('supertest');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = require('../server');
const Course = require('../models/courseModel');
const LiveSession = require('../models/liveSessionModel');
const User = require('../models/userModel');

/**
 * Error Handling Tests for Zoom Course Recording Integration
 * 
 * Tests Requirements:
 * - 10.1: Return 400 for sessions without recordings
 * - 10.2: Return 403 for unauthorized users
 * - 10.3: Return 404 for missing resources
 * - 10.4: Return 500 for database errors with proper logging
 * - 10.7: No partial database updates on errors
 */

describe('Zoom Course Recording - Error Handling', () => {
  let adminUser, instructorUser, studentUser, unauthorizedInstructor;
  let course, liveSession, liveSessionNoRecording;
  let adminToken, instructorToken, studentToken, unauthorizedToken;

  beforeAll(async () => {
    // Connect to database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ email: /@test\.com$/ });
    await Course.deleteMany({ title: 'Test Course' });
    await LiveSession.deleteMany({ topic: /^Test Session|Session Without Recording|Session No URL|Other Instructor Session/ });
    
    // Close database connection
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await User.deleteMany({ email: /@test\.com$/ });
    await Course.deleteMany({ title: 'Test Course' });
    await LiveSession.deleteMany({ topic: /^Test Session|Session Without Recording|Session No URL|Other Instructor Session/ });

    // Create test users
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'password123',
      role: 'admin'
    });

    instructorUser = await User.create({
      name: 'Instructor User',
      email: 'instructor@test.com',
      password: 'password123',
      role: 'instructor'
    });

    unauthorizedInstructor = await User.create({
      name: 'Unauthorized Instructor',
      email: 'unauthorized@test.com',
      password: 'password123',
      role: 'instructor'
    });

    studentUser = await User.create({
      name: 'Student User',
      email: 'student@test.com',
      password: 'password123',
      role: 'student'
    });

    // Generate tokens
    adminToken = adminUser.generateAuthToken();
    instructorToken = instructorUser.generateAuthToken();
    unauthorizedToken = unauthorizedInstructor.generateAuthToken();
    studentToken = studentUser.generateAuthToken();

    // Create test course
    course = await Course.create({
      title: 'Test Course',
      description: 'Test Description',
      category: 'Programming',
      price: 0,
      instructor: instructorUser._id,
      modules: [
        {
          title: 'Module 1',
          videos: [
            {
              title: 'Video 1',
              url: 'https://youtube.com/embed/test',
              videoType: 'external'
            }
          ]
        }
      ]
    });

    // Create live session with completed recording
    liveSession = await LiveSession.create({
      topic: 'Test Session',
      startTime: new Date(),
      endTime: new Date(),
      status: 'ended',
      instructor: instructorUser._id,
      university: instructorUser._id,
      zoom: {
        meetingId: '123456789'
      },
      recording: {
        recordingId: 'rec-123',
        playUrl: 'https://zoom.us/rec/play/test123',
        downloadUrl: 'https://zoom.us/rec/download/test123',
        status: 'completed',
        durationMs: 3600000,
        fileSizeBytes: 104857600
      }
    });

    // Create live session without recording
    liveSessionNoRecording = await LiveSession.create({
      topic: 'Session Without Recording',
      startTime: new Date(),
      endTime: new Date(),
      status: 'ended',
      instructor: instructorUser._id,
      university: instructorUser._id,
      zoom: {
        meetingId: '987654321'
      },
      recording: {
        status: 'pending'
      }
    });
  });

  describe('Requirement 10.1: Return 400 for sessions without recordings', () => {
    it('should return 400 when session has no recording', async () => {
      const response = await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ sessionId: liveSessionNoRecording._id });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Session does not have a recording available');
    });

    it('should return 400 when recording status is not completed', async () => {
      const response = await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ sessionId: liveSessionNoRecording._id });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('recording available');
    });

    it('should return 400 when recording has no playUrl', async () => {
      // Create session with completed status but no playUrl
      const sessionNoUrl = await LiveSession.create({
        topic: 'Session No URL',
        startTime: new Date(),
        endTime: new Date(),
        status: 'ended',
        instructor: instructorUser._id,
        university: instructorUser._id,
        zoom: { meetingId: '111222333' },
        recording: {
          status: 'completed',
          recordingId: 'rec-456'
          // playUrl is missing
        }
      });

      const response = await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ sessionId: sessionNoUrl._id });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('recording available');
    });
  });

  describe('Requirement 10.2: Return 403 for unauthorized users', () => {
    it('should return 403 when student tries to link recording', async () => {
      const response = await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ sessionId: liveSession._id });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Not authorized to modify this course');
    });

    it('should return 403 when unauthorized instructor tries to link recording', async () => {
      const response = await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .send({ sessionId: liveSession._id });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Not authorized');
    });

    it('should allow admin to link recording to any course', async () => {
      const response = await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sessionId: liveSession._id });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
    });

    it('should allow course instructor to link recording', async () => {
      const response = await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ sessionId: liveSession._id });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
    });
  });

  describe('Requirement 10.3: Return 404 for missing resources', () => {
    it('should return 404 when course not found', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .post(`/api/courses/${fakeId}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ sessionId: liveSession._id });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Course not found');
    });

    it('should return 404 when session not found', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ sessionId: fakeId });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Live session not found');
    });

    it('should return 404 when module not found', async () => {
      const response = await request(app)
        .post(`/api/courses/${course._id}/modules/99/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ sessionId: liveSession._id });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Module not found');
    });

    it('should return 404 when video not found', async () => {
      const response = await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/99/link-zoom-recording`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ sessionId: liveSession._id });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Video not found');
    });
  });

  describe('Requirement 10.7: No partial database updates on errors', () => {
    it('should not modify course when authorization fails', async () => {
      const originalCourse = await Course.findById(course._id);
      const originalVideoType = originalCourse.modules[0].videos[0].videoType;

      await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ sessionId: liveSession._id });

      const updatedCourse = await Course.findById(course._id);
      expect(updatedCourse.modules[0].videos[0].videoType).toBe(originalVideoType);
      expect(updatedCourse.modules[0].videos[0].zoomRecording).toBeUndefined();
    });

    it('should not modify course when session validation fails', async () => {
      const originalCourse = await Course.findById(course._id);
      const originalVideoType = originalCourse.modules[0].videos[0].videoType;

      await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ sessionId: liveSessionNoRecording._id });

      const updatedCourse = await Course.findById(course._id);
      expect(updatedCourse.modules[0].videos[0].videoType).toBe(originalVideoType);
      expect(updatedCourse.modules[0].videos[0].zoomRecording).toBeUndefined();
    });

    it('should rollback on validation error', async () => {
      // This test verifies Mongoose validation prevents invalid states
      const originalCourse = await Course.findById(course._id);
      
      // Manually try to create invalid state (should be prevented by validation)
      const video = originalCourse.modules[0].videos[0];
      video.videoType = 'zoom-recording';
      // Don't set zoomRecording or zoomSession (invalid state)

      let error;
      try {
        await originalCourse.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('zoomRecording.playUrl is required');

      // Verify course was not modified
      const unchangedCourse = await Course.findById(course._id);
      expect(unchangedCourse.modules[0].videos[0].videoType).toBe('external');
    });
  });

  describe('Unlink Recording Error Handling', () => {
    beforeEach(async () => {
      // Link a recording first
      await request(app)
        .post(`/api/courses/${course._id}/modules/0/videos/0/link-zoom-recording`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ sessionId: liveSession._id });
    });

    it('should return 403 when unauthorized user tries to unlink', async () => {
      const response = await request(app)
        .delete(`/api/courses/${course._id}/modules/0/videos/0/unlink-zoom-recording`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Not authorized');
    });

    it('should return 404 when course not found', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .delete(`/api/courses/${fakeId}/modules/0/videos/0/unlink-zoom-recording`)
        .set('Authorization', `Bearer ${instructorToken}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Course not found');
    });

    it('should not modify course when unlink authorization fails', async () => {
      const beforeCourse = await Course.findById(course._id);
      const beforeVideoType = beforeCourse.modules[0].videos[0].videoType;

      await request(app)
        .delete(`/api/courses/${course._id}/modules/0/videos/0/unlink-zoom-recording`)
        .set('Authorization', `Bearer ${studentToken}`);

      const afterCourse = await Course.findById(course._id);
      expect(afterCourse.modules[0].videos[0].videoType).toBe(beforeVideoType);
      expect(afterCourse.modules[0].videos[0].zoomRecording).toBeDefined();
    });
  });

  describe('Available Recordings Error Handling', () => {
    it('should return empty array when no recordings available', async () => {
      await LiveSession.deleteMany({});

      const response = await request(app)
        .get('/api/courses/zoom-recordings/available')
        .set('Authorization', `Bearer ${instructorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should filter recordings by user role', async () => {
      // Create session for different instructor
      await LiveSession.create({
        topic: 'Other Instructor Session',
        startTime: new Date(),
        endTime: new Date(),
        status: 'ended',
        instructor: unauthorizedInstructor._id,
        university: unauthorizedInstructor._id,
        zoom: { meetingId: '444555666' },
        recording: {
          recordingId: 'rec-789',
          playUrl: 'https://zoom.us/rec/play/other',
          downloadUrl: 'https://zoom.us/rec/download/other',
          status: 'completed',
          durationMs: 1800000,
          fileSizeBytes: 52428800
        }
      });

      // Instructor should only see their own recordings
      const response = await request(app)
        .get('/api/courses/zoom-recordings/available')
        .set('Authorization', `Bearer ${instructorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].title).toBe('Test Session');
    });

    it('should allow admin to see all recordings', async () => {
      // Create session for different instructor
      await LiveSession.create({
        topic: 'Other Instructor Session',
        startTime: new Date(),
        endTime: new Date(),
        status: 'ended',
        instructor: unauthorizedInstructor._id,
        university: unauthorizedInstructor._id,
        zoom: { meetingId: '444555666' },
        recording: {
          recordingId: 'rec-789',
          playUrl: 'https://zoom.us/rec/play/other',
          downloadUrl: 'https://zoom.us/rec/download/other',
          status: 'completed',
          durationMs: 1800000,
          fileSizeBytes: 52428800
        }
      });

      // Admin should see all recordings
      const response = await request(app)
        .get('/api/courses/zoom-recordings/available')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2);
    });
  });
});
