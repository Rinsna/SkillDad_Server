const {
  checkExamAccess,
  isValidStatusTransition,
  updateExamStatus,
  getValidTransitions,
  startExam,
  completeExam,
  markExamAsGraded,
  publishExam,
  checkAllSubmissionsGraded,
  calculateTimeRemaining,
  isExamActive,
  hasExamStarted,
  hasExamEnded
} = require('./examAccessService');

const Exam = require('../models/examModel');
const Enrollment = require('../models/enrollmentModel');
const ExamSubmissionNew = require('../models/examSubmissionNewModel');

// Mock the models
jest.mock('../models/examModel');
jest.mock('../models/enrollmentModel');
jest.mock('../models/examSubmissionNewModel');

describe('Exam Access Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkExamAccess', () => {
    const examId = 'exam123';
    const studentId = 'student123';
    const courseId = 'course123';

    it('should deny access if exam not found', async () => {
      Exam.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      const result = await checkExamAccess(examId, studentId);

      expect(result.canAccess).toBe(false);
      expect(result.reason).toBe('Exam not found');
    });

    it('should deny access if student not enrolled in course', async () => {
      const mockExam = {
        _id: examId,
        course: { _id: courseId },
        status: 'scheduled',
        scheduledStartTime: new Date(Date.now() - 3600000), // 1 hour ago
        scheduledEndTime: new Date(Date.now() + 3600000), // 1 hour from now
        allowLateSubmission: false
      };

      Exam.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockExam)
      });

      Enrollment.findOne.mockResolvedValue(null);

      const result = await checkExamAccess(examId, studentId);

      expect(result.canAccess).toBe(false);
      expect(result.reason).toBe('Not enrolled in course');
    });

    it('should deny access if exam has ended', async () => {
      const mockExam = {
        _id: examId,
        course: { _id: courseId },
        status: 'completed',
        scheduledStartTime: new Date(Date.now() - 7200000),
        scheduledEndTime: new Date(Date.now() - 3600000),
        allowLateSubmission: false
      };

      Exam.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockExam)
      });

      Enrollment.findOne.mockResolvedValue({ student: studentId, course: courseId });

      const result = await checkExamAccess(examId, studentId);

      expect(result.canAccess).toBe(false);
      expect(result.reason).toBe('Exam has ended');
    });

    it('should deny access if exam has not started yet', async () => {
      const startTime = new Date(Date.now() + 3600000); // 1 hour from now
      const mockExam = {
        _id: examId,
        course: { _id: courseId },
        status: 'scheduled',
        scheduledStartTime: startTime,
        scheduledEndTime: new Date(Date.now() + 7200000),
        allowLateSubmission: false
      };

      Exam.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockExam)
      });

      Enrollment.findOne.mockResolvedValue({ student: studentId, course: courseId });

      const result = await checkExamAccess(examId, studentId);

      expect(result.canAccess).toBe(false);
      expect(result.reason).toContain('Exam starts in');
      expect(result.startsAt).toEqual(startTime);
    });

    it('should deny access if exam time expired and no late submission', async () => {
      const mockExam = {
        _id: examId,
        course: { _id: courseId },
        status: 'ongoing',
        scheduledStartTime: new Date(Date.now() - 7200000),
        scheduledEndTime: new Date(Date.now() - 3600000),
        allowLateSubmission: false
      };

      Exam.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockExam)
      });

      Enrollment.findOne.mockResolvedValue({ student: studentId, course: courseId });

      const result = await checkExamAccess(examId, studentId);

      expect(result.canAccess).toBe(false);
      expect(result.reason).toBe('Exam time has expired');
    });

    it('should deny access if late submission deadline passed', async () => {
      const mockExam = {
        _id: examId,
        course: { _id: courseId },
        status: 'ongoing',
        scheduledStartTime: new Date(Date.now() - 7200000),
        scheduledEndTime: new Date(Date.now() - 3600000),
        allowLateSubmission: true,
        lateSubmissionDeadline: new Date(Date.now() - 1800000) // 30 minutes ago
      };

      Exam.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockExam)
      });

      Enrollment.findOne.mockResolvedValue({ student: studentId, course: courseId });

      const result = await checkExamAccess(examId, studentId);

      expect(result.canAccess).toBe(false);
      expect(result.reason).toBe('Late submission deadline passed');
    });

    it('should deny access if student already submitted', async () => {
      const mockExam = {
        _id: examId,
        course: { _id: courseId },
        status: 'ongoing',
        scheduledStartTime: new Date(Date.now() - 3600000),
        scheduledEndTime: new Date(Date.now() + 3600000),
        allowLateSubmission: false
      };

      Exam.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockExam)
      });

      Enrollment.findOne.mockResolvedValue({ student: studentId, course: courseId });
      ExamSubmissionNew.findOne.mockResolvedValue({ 
        exam: examId, 
        student: studentId, 
        status: 'submitted' 
      });

      const result = await checkExamAccess(examId, studentId);

      expect(result.canAccess).toBe(false);
      expect(result.reason).toBe('Already submitted');
    });

    it('should grant access when all conditions are met', async () => {
      const mockExam = {
        _id: examId,
        course: { _id: courseId },
        status: 'ongoing',
        scheduledStartTime: new Date(Date.now() - 3600000),
        scheduledEndTime: new Date(Date.now() + 3600000),
        allowLateSubmission: false
      };

      Exam.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockExam)
      });

      Enrollment.findOne.mockResolvedValue({ student: studentId, course: courseId });
      ExamSubmissionNew.findOne.mockResolvedValue(null);

      const result = await checkExamAccess(examId, studentId);

      expect(result.canAccess).toBe(true);
      expect(result.reason).toBe('Access granted');
      expect(result.timeRemaining).toBeGreaterThan(0);
      expect(result.exam).toEqual(mockExam);
    });

    it('should grant access during late submission window', async () => {
      const mockExam = {
        _id: examId,
        course: { _id: courseId },
        status: 'ongoing',
        scheduledStartTime: new Date(Date.now() - 7200000),
        scheduledEndTime: new Date(Date.now() - 3600000),
        allowLateSubmission: true,
        lateSubmissionDeadline: new Date(Date.now() + 1800000) // 30 minutes from now
      };

      Exam.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockExam)
      });

      Enrollment.findOne.mockResolvedValue({ student: studentId, course: courseId });
      ExamSubmissionNew.findOne.mockResolvedValue(null);

      const result = await checkExamAccess(examId, studentId);

      expect(result.canAccess).toBe(true);
      expect(result.reason).toBe('Access granted');
      expect(result.timeRemaining).toBeGreaterThan(0);
    });
  });

  describe('Status Transition Functions', () => {
    describe('isValidStatusTransition', () => {
      it('should validate correct transitions', () => {
        expect(isValidStatusTransition('scheduled', 'ongoing')).toBe(true);
        expect(isValidStatusTransition('ongoing', 'completed')).toBe(true);
        expect(isValidStatusTransition('completed', 'graded')).toBe(true);
        expect(isValidStatusTransition('graded', 'published')).toBe(true);
      });

      it('should reject invalid transitions', () => {
        expect(isValidStatusTransition('scheduled', 'completed')).toBe(false);
        expect(isValidStatusTransition('ongoing', 'published')).toBe(false);
        expect(isValidStatusTransition('completed', 'ongoing')).toBe(false);
        expect(isValidStatusTransition('published', 'graded')).toBe(false);
      });
    });

    describe('getValidTransitions', () => {
      it('should return valid next statuses', () => {
        expect(getValidTransitions('scheduled')).toEqual(['ongoing']);
        expect(getValidTransitions('ongoing')).toEqual(['completed']);
        expect(getValidTransitions('completed')).toEqual(['graded']);
        expect(getValidTransitions('graded')).toEqual(['published']);
      });

      it('should return empty array for invalid status', () => {
        expect(getValidTransitions('invalid')).toEqual([]);
        expect(getValidTransitions('published')).toEqual([]);
      });
    });

    describe('updateExamStatus', () => {
      it('should update status when transition is valid', async () => {
        const mockExam = {
          _id: 'exam123',
          status: 'scheduled',
          save: jest.fn().mockResolvedValue(true)
        };

        Exam.findById.mockResolvedValue(mockExam);

        const result = await updateExamStatus('exam123', 'ongoing');

        expect(result.status).toBe('ongoing');
        expect(mockExam.save).toHaveBeenCalled();
      });

      it('should throw error when exam not found', async () => {
        Exam.findById.mockResolvedValue(null);

        await expect(updateExamStatus('exam123', 'ongoing'))
          .rejects.toThrow('Exam not found');
      });

      it('should throw error when transition is invalid', async () => {
        const mockExam = {
          _id: 'exam123',
          status: 'scheduled'
        };

        Exam.findById.mockResolvedValue(mockExam);

        await expect(updateExamStatus('exam123', 'completed'))
          .rejects.toThrow('Invalid status transition');
      });
    });

    describe('startExam', () => {
      it('should transition exam to ongoing', async () => {
        const mockExam = {
          _id: 'exam123',
          status: 'scheduled',
          save: jest.fn().mockResolvedValue(true)
        };

        Exam.findById.mockResolvedValue(mockExam);

        const result = await startExam('exam123');

        expect(result.status).toBe('ongoing');
      });
    });

    describe('completeExam', () => {
      it('should transition exam to completed', async () => {
        const mockExam = {
          _id: 'exam123',
          status: 'ongoing',
          save: jest.fn().mockResolvedValue(true)
        };

        Exam.findById.mockResolvedValue(mockExam);

        const result = await completeExam('exam123');

        expect(result.status).toBe('completed');
      });
    });

    describe('markExamAsGraded', () => {
      it('should transition exam to graded', async () => {
        const mockExam = {
          _id: 'exam123',
          status: 'completed',
          save: jest.fn().mockResolvedValue(true)
        };

        Exam.findById.mockResolvedValue(mockExam);

        const result = await markExamAsGraded('exam123');

        expect(result.status).toBe('graded');
      });
    });

    describe('publishExam', () => {
      it('should transition exam to published and set timestamps', async () => {
        const mockExam = {
          _id: 'exam123',
          status: 'graded',
          save: jest.fn().mockResolvedValue(true)
        };

        Exam.findById.mockResolvedValue(mockExam);

        const result = await publishExam('exam123');

        expect(result.status).toBe('published');
        expect(result.resultsPublished).toBe(true);
        expect(result.publishedAt).toBeInstanceOf(Date);
      });
    });
  });

  describe('checkAllSubmissionsGraded', () => {
    it('should return true when all submissions are graded', async () => {
      ExamSubmissionNew.countDocuments
        .mockResolvedValueOnce(10) // total submissions
        .mockResolvedValueOnce(10); // graded submissions

      const result = await checkAllSubmissionsGraded('exam123');

      expect(result.allGraded).toBe(true);
      expect(result.totalSubmissions).toBe(10);
      expect(result.gradedCount).toBe(10);
      expect(result.ungradedCount).toBe(0);
    });

    it('should return false when some submissions are not graded', async () => {
      ExamSubmissionNew.countDocuments
        .mockResolvedValueOnce(10) // total submissions
        .mockResolvedValueOnce(7);  // graded submissions

      const result = await checkAllSubmissionsGraded('exam123');

      expect(result.allGraded).toBe(false);
      expect(result.totalSubmissions).toBe(10);
      expect(result.gradedCount).toBe(7);
      expect(result.ungradedCount).toBe(3);
    });

    it('should return false when no submissions exist', async () => {
      ExamSubmissionNew.countDocuments
        .mockResolvedValueOnce(0) // total submissions
        .mockResolvedValueOnce(0); // graded submissions

      const result = await checkAllSubmissionsGraded('exam123');

      expect(result.allGraded).toBe(false);
      expect(result.totalSubmissions).toBe(0);
      expect(result.gradedCount).toBe(0);
    });
  });

  describe('Time Calculation Functions', () => {
    describe('calculateTimeRemaining', () => {
      it('should calculate time remaining correctly', () => {
        const exam = {
          scheduledEndTime: new Date(Date.now() + 3600000), // 1 hour from now
          allowLateSubmission: false
        };

        const timeRemaining = calculateTimeRemaining(exam);

        expect(timeRemaining).toBeGreaterThan(3500);
        expect(timeRemaining).toBeLessThanOrEqual(3600);
      });

      it('should use late submission deadline when applicable', () => {
        const exam = {
          scheduledEndTime: new Date(Date.now() - 3600000), // 1 hour ago
          allowLateSubmission: true,
          lateSubmissionDeadline: new Date(Date.now() + 1800000) // 30 minutes from now
        };

        const timeRemaining = calculateTimeRemaining(exam);

        expect(timeRemaining).toBeGreaterThan(1700);
        expect(timeRemaining).toBeLessThanOrEqual(1800);
      });

      it('should return 0 when exam has expired', () => {
        const exam = {
          scheduledEndTime: new Date(Date.now() - 3600000),
          allowLateSubmission: false
        };

        const timeRemaining = calculateTimeRemaining(exam);

        expect(timeRemaining).toBe(0);
      });
    });

    describe('isExamActive', () => {
      it('should return true when exam is active', () => {
        const exam = {
          scheduledStartTime: new Date(Date.now() - 3600000),
          scheduledEndTime: new Date(Date.now() + 3600000),
          allowLateSubmission: false
        };

        expect(isExamActive(exam)).toBe(true);
      });

      it('should return false when exam has not started', () => {
        const exam = {
          scheduledStartTime: new Date(Date.now() + 3600000),
          scheduledEndTime: new Date(Date.now() + 7200000),
          allowLateSubmission: false
        };

        expect(isExamActive(exam)).toBe(false);
      });

      it('should return false when exam has ended', () => {
        const exam = {
          scheduledStartTime: new Date(Date.now() - 7200000),
          scheduledEndTime: new Date(Date.now() - 3600000),
          allowLateSubmission: false
        };

        expect(isExamActive(exam)).toBe(false);
      });

      it('should return true during late submission window', () => {
        const exam = {
          scheduledStartTime: new Date(Date.now() - 7200000),
          scheduledEndTime: new Date(Date.now() - 3600000),
          allowLateSubmission: true,
          lateSubmissionDeadline: new Date(Date.now() + 1800000)
        };

        expect(isExamActive(exam)).toBe(true);
      });
    });

    describe('hasExamStarted', () => {
      it('should return true when exam has started', () => {
        const exam = {
          scheduledStartTime: new Date(Date.now() - 3600000)
        };

        expect(hasExamStarted(exam)).toBe(true);
      });

      it('should return false when exam has not started', () => {
        const exam = {
          scheduledStartTime: new Date(Date.now() + 3600000)
        };

        expect(hasExamStarted(exam)).toBe(false);
      });
    });

    describe('hasExamEnded', () => {
      it('should return true when exam has ended', () => {
        const exam = {
          scheduledEndTime: new Date(Date.now() - 3600000),
          allowLateSubmission: false
        };

        expect(hasExamEnded(exam)).toBe(true);
      });

      it('should return false when exam is ongoing', () => {
        const exam = {
          scheduledEndTime: new Date(Date.now() + 3600000),
          allowLateSubmission: false
        };

        expect(hasExamEnded(exam)).toBe(false);
      });

      it('should consider late submission deadline', () => {
        const exam = {
          scheduledEndTime: new Date(Date.now() - 3600000),
          allowLateSubmission: true,
          lateSubmissionDeadline: new Date(Date.now() + 1800000)
        };

        expect(hasExamEnded(exam)).toBe(false);
      });
    });
  });
});
