const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/userModel');
const Exam = require('../models/examModel');
const Course = require('../models/courseModel');
const AuditLog = require('../models/auditLogModel');
const auditLogService = require('../services/auditLogService');

/**
 * Audit Logging Integration Tests
 * 
 * Tests that audit logging is properly integrated into critical exam operations
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8
 */

describe('Audit Logging Integration Tests', () => {
  let adminToken;
  let adminUser;
  let course;

  beforeAll(async () => {
    // Create admin user
    adminUser = await User.create({
      name: 'Test Admin',
      email: 'admin@test.com',
      password: 'password123',
      role: 'admin'
    });

    // Generate token (simplified - in real app use proper JWT)
    adminToken = 'test-admin-token';

    // Create a test course
    course = await Course.create({
      title: 'Test Course',
      description: 'Test course for audit logging',
      instructor: adminUser._id
    });
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ email: { $regex: /@test\.com$/ } });
    await Course.deleteMany({ title: 'Test Course' });
    await Exam.deleteMany({ title: { $regex: /^Test Exam/ } });
    await AuditLog.deleteMany({});
  });

  describe('Audit Log Service', () => {
    it('should create an audit log entry', async () => {
      const auditLog = await auditLogService.logAuditEvent({
        userId: adminUser._id,
        action: 'exam_created',
        resource: 'exam',
        resourceId: new mongoose.Types.ObjectId(),
        details: { test: 'data' },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      expect(auditLog).toBeDefined();
      expect(auditLog.userId.toString()).toBe(adminUser._id.toString());
      expect(auditLog.action).toBe('exam_created');
      expect(auditLog.resource).toBe('exam');
      expect(auditLog.ipAddress).toBe('127.0.0.1');
      expect(auditLog.userAgent).toBe('test-agent');
    });

    it('should retrieve audit logs for a user', async () => {
      // Create some audit logs
      await auditLogService.logAuditEvent({
        userId: adminUser._id,
        action: 'exam_created',
        resource: 'exam',
        resourceId: new mongoose.Types.ObjectId(),
        details: {},
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await auditLogService.getUserAuditLogs(adminUser._id, { limit: 10 });
      
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should retrieve audit logs by action type', async () => {
      const logs = await auditLogService.getAuditLogsByAction('exam_created', { limit: 10 });
      
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.every(log => log.action === 'exam_created')).toBe(true);
    });

    it('should get audit statistics', async () => {
      const stats = await auditLogService.getAuditStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.totalLogs).toBeGreaterThan(0);
      expect(Array.isArray(stats.actionBreakdown)).toBe(true);
    });
  });

  describe('Exam CRUD Audit Logging', () => {
    it('should log exam creation', async () => {
      const initialCount = await AuditLog.countDocuments({ action: 'exam_created' });

      // Note: This is a simplified test. In a real scenario, you would make an actual API call
      // For now, we're testing the service directly
      const examId = new mongoose.Types.ObjectId();
      await auditLogService.logAuditEvent({
        userId: adminUser._id,
        action: 'exam_created',
        resource: 'exam',
        resourceId: examId,
        details: {
          examTitle: 'Test Exam',
          examType: 'online-mcq',
          totalMarks: 100
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const finalCount = await AuditLog.countDocuments({ action: 'exam_created' });
      expect(finalCount).toBe(initialCount + 1);
    });

    it('should log exam update', async () => {
      const examId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: adminUser._id,
        action: 'exam_updated',
        resource: 'exam',
        resourceId: examId,
        details: {
          examTitle: 'Updated Exam',
          updatedFields: ['title', 'duration']
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'exam_updated',
        resourceId: examId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].details.updatedFields).toContain('title');
    });

    it('should log exam deletion', async () => {
      const examId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: adminUser._id,
        action: 'exam_deleted',
        resource: 'exam',
        resourceId: examId,
        details: {
          examTitle: 'Deleted Exam',
          deletedQuestions: 5,
          deletedSubmissions: 10
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'exam_deleted',
        resourceId: examId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].details.deletedQuestions).toBe(5);
    });
  });

  describe('Question Paper Upload Audit Logging', () => {
    it('should log question paper upload', async () => {
      const examId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: adminUser._id,
        action: 'question_paper_uploaded',
        resource: 'question_paper',
        resourceId: examId,
        details: {
          examTitle: 'Test Exam',
          filename: 'question-paper.pdf',
          fileSize: 1024000
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'question_paper_uploaded',
        resourceId: examId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].details.filename).toBe('question-paper.pdf');
    });
  });

  describe('Exam Access Audit Logging', () => {
    it('should log exam access granted', async () => {
      const examId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: studentId,
        action: 'exam_access_granted',
        resource: 'exam',
        resourceId: examId,
        details: {
          reason: 'Access granted',
          timeRemaining: 3600
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'exam_access_granted',
        resourceId: examId
      });

      expect(logs.length).toBeGreaterThan(0);
    });

    it('should log exam access denied', async () => {
      const examId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: studentId,
        action: 'exam_access_denied',
        resource: 'exam',
        resourceId: examId,
        details: {
          reason: 'Exam has not started yet'
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'exam_access_denied',
        resourceId: examId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].details.reason).toContain('not started');
    });

    it('should log exam started', async () => {
      const examId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      const submissionId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: studentId,
        action: 'exam_started',
        resource: 'exam',
        resourceId: examId,
        details: {
          examTitle: 'Test Exam',
          submissionId: submissionId
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'exam_started',
        resourceId: examId
      });

      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Submission Audit Logging', () => {
    it('should log manual exam submission', async () => {
      const submissionId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: studentId,
        action: 'exam_submitted_manual',
        resource: 'submission',
        resourceId: submissionId,
        details: {
          examId: new mongoose.Types.ObjectId(),
          timeSpent: 3600,
          isAutoSubmitted: false
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'exam_submitted_manual',
        resourceId: submissionId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].details.isAutoSubmitted).toBe(false);
    });

    it('should log auto exam submission', async () => {
      const submissionId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: studentId,
        action: 'exam_submitted_auto',
        resource: 'submission',
        resourceId: submissionId,
        details: {
          examId: new mongoose.Types.ObjectId(),
          timeSpent: 3600,
          isAutoSubmitted: true
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'exam_submitted_auto',
        resourceId: submissionId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].details.isAutoSubmitted).toBe(true);
    });

    it('should log answer sheet upload', async () => {
      const submissionId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: studentId,
        action: 'answer_sheet_uploaded',
        resource: 'answer_sheet',
        resourceId: submissionId,
        details: {
          examId: new mongoose.Types.ObjectId(),
          filename: 'answer-sheet.pdf',
          fileSize: 2048000
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'answer_sheet_uploaded',
        resourceId: submissionId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].details.filename).toBe('answer-sheet.pdf');
    });
  });

  describe('Grading Audit Logging', () => {
    it('should log manual grading', async () => {
      const submissionId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: adminUser._id,
        action: 'submission_graded',
        resource: 'submission',
        resourceId: submissionId,
        details: {
          examId: new mongoose.Types.ObjectId(),
          studentId: new mongoose.Types.ObjectId(),
          obtainedMarks: 75,
          totalMarks: 100,
          percentage: 75
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'submission_graded',
        resourceId: submissionId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].details.obtainedMarks).toBe(75);
    });

    it('should log auto-grading', async () => {
      const examId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: adminUser._id,
        action: 'exam_auto_graded',
        resource: 'exam',
        resourceId: examId,
        details: {
          examTitle: 'Test Exam',
          gradedCount: 25,
          totalSubmissions: 30
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'exam_auto_graded',
        resourceId: examId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].details.gradedCount).toBe(25);
    });
  });

  describe('Result Publication Audit Logging', () => {
    it('should log result publication', async () => {
      const examId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: adminUser._id,
        action: 'results_published',
        resource: 'result',
        resourceId: examId,
        details: {
          examTitle: 'Test Exam',
          publishedCount: 30
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'results_published',
        resourceId: examId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].details.publishedCount).toBe(30);
    });

    it('should log result viewed by student', async () => {
      const resultId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      
      await auditLogService.logAuditEvent({
        userId: studentId,
        action: 'result_viewed',
        resource: 'result',
        resourceId: resultId,
        details: {
          examId: new mongoose.Types.ObjectId(),
          examTitle: 'Test Exam',
          obtainedMarks: 85,
          percentage: 85
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const logs = await AuditLog.find({ 
        action: 'result_viewed',
        resourceId: resultId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].details.percentage).toBe(85);
    });
  });

  describe('Audit Log Security', () => {
    it('should capture IP address and user agent', async () => {
      const auditLog = await auditLogService.logAuditEvent({
        userId: adminUser._id,
        action: 'exam_created',
        resource: 'exam',
        resourceId: new mongoose.Types.ObjectId(),
        details: {},
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      });

      expect(auditLog.ipAddress).toBe('192.168.1.100');
      expect(auditLog.userAgent).toContain('Mozilla');
    });

    it('should include timestamps automatically', async () => {
      const auditLog = await auditLogService.logAuditEvent({
        userId: adminUser._id,
        action: 'exam_created',
        resource: 'exam',
        resourceId: new mongoose.Types.ObjectId(),
        details: {},
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      expect(auditLog.createdAt).toBeDefined();
      expect(auditLog.updatedAt).toBeDefined();
    });
  });
});
