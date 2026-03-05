const Exam = require('../models/examModel');
const Enrollment = require('../models/enrollmentModel');
const ExamSubmissionNew = require('../models/examSubmissionNewModel');

/**
 * Exam Access Control Service
 * Handles exam access validation and status management
 */

/**
 * Checks if a student can access an exam
 * 
 * Validates:
 * - Exam exists
 * - Student is enrolled in the course
 * - Current time is within exam window
 * - Student hasn't already submitted
 * - Exam status allows access
 * 
 * @param {ObjectId} examId - The exam to check access for
 * @param {ObjectId} studentId - The student requesting access
 * @returns {Object} { canAccess: boolean, reason: string, timeRemaining?: number, exam?: Object }
 */
async function checkExamAccess(examId, studentId) {
  try {
    // Step 1: Fetch exam with course information
    const exam = await Exam.findById(examId).populate('course');
    
    if (!exam) {
      return { 
        canAccess: false, 
        reason: 'Exam not found' 
      };
    }
    
    // Step 2: Verify student enrollment in course
    const enrollment = await Enrollment.findOne({
      student: studentId,
      course: exam.course._id,
      status: 'active'
    });
    
    if (!enrollment) {
      return { 
        canAccess: false, 
        reason: 'Not enrolled in course' 
      };
    }
    
    // Step 3: Check exam status
    if (exam.status === 'completed' || exam.status === 'graded' || exam.status === 'published') {
      return { 
        canAccess: false, 
        reason: 'Exam has ended' 
      };
    }
    
    // Step 4: Check time window
    const now = new Date();
    const startTime = new Date(exam.scheduledStartTime);
    const endTime = new Date(exam.scheduledEndTime);
    
    // Before exam starts
    if (now < startTime) {
      const minutesUntilStart = Math.floor((startTime - now) / 60000);
      return { 
        canAccess: false, 
        reason: `Exam starts in ${minutesUntilStart} minutes`,
        startsAt: startTime
      };
    }
    
    // After scheduled end time
    if (now > endTime) {
      // Check if late submission is allowed
      if (!exam.allowLateSubmission) {
        return { 
          canAccess: false, 
          reason: 'Exam time has expired' 
        };
      }
      
      // Check late submission deadline
      const lateDeadline = new Date(exam.lateSubmissionDeadline);
      if (now > lateDeadline) {
        return { 
          canAccess: false, 
          reason: 'Late submission deadline passed' 
        };
      }
    }
    
    // Step 5: Check for existing submission
    const existingSubmission = await ExamSubmissionNew.findOne({
      exam: examId,
      student: studentId,
      status: { $in: ['submitted', 'graded'] }
    });
    
    if (existingSubmission) {
      return { 
        canAccess: false, 
        reason: 'Already submitted' 
      };
    }
    
    // Step 6: Calculate time remaining
    const effectiveEndTime = exam.allowLateSubmission && exam.lateSubmissionDeadline
      ? new Date(exam.lateSubmissionDeadline)
      : endTime;
    
    const timeRemaining = Math.floor((effectiveEndTime - now) / 1000); // in seconds
    
    // Access granted
    return {
      canAccess: true,
      reason: 'Access granted',
      timeRemaining: Math.max(0, timeRemaining),
      exam
    };
  } catch (error) {
    console.error('Error checking exam access:', error);
    throw error;
  }
}

/**
 * Validates if an exam status transition is valid
 * 
 * Valid transitions:
 * - scheduled → ongoing
 * - ongoing → completed
 * - completed → graded
 * - graded → published
 * 
 * @param {string} currentStatus - Current exam status
 * @param {string} newStatus - Desired new status
 * @returns {boolean} True if transition is valid
 */
function isValidStatusTransition(currentStatus, newStatus) {
  const validTransitions = {
    'scheduled': ['ongoing'],
    'ongoing': ['completed'],
    'completed': ['graded'],
    'graded': ['published']
  };
  
  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

/**
 * Updates exam status with validation
 * 
 * @param {ObjectId} examId - The exam to update
 * @param {string} newStatus - The new status to set
 * @returns {Object} Updated exam object
 * @throws {Error} If transition is invalid
 */
async function updateExamStatus(examId, newStatus) {
  try {
    const exam = await Exam.findById(examId);
    
    if (!exam) {
      throw new Error('Exam not found');
    }
    
    // Validate status transition
    if (!isValidStatusTransition(exam.status, newStatus)) {
      throw new Error(
        `Invalid status transition from '${exam.status}' to '${newStatus}'. ` +
        `Valid transitions: ${JSON.stringify(getValidTransitions(exam.status))}`
      );
    }
    
    // Update status
    exam.status = newStatus;
    await exam.save();
    
    return exam;
  } catch (error) {
    console.error('Error updating exam status:', error);
    throw error;
  }
}

/**
 * Gets valid status transitions for current status
 * 
 * @param {string} currentStatus - Current exam status
 * @returns {Array<string>} Array of valid next statuses
 */
function getValidTransitions(currentStatus) {
  const validTransitions = {
    'scheduled': ['ongoing'],
    'ongoing': ['completed'],
    'completed': ['graded'],
    'graded': ['published']
  };
  
  return validTransitions[currentStatus] || [];
}

/**
 * Transitions exam to 'ongoing' status
 * 
 * @param {ObjectId} examId - The exam to start
 * @returns {Object} Updated exam object
 */
async function startExam(examId) {
  return await updateExamStatus(examId, 'ongoing');
}

/**
 * Transitions exam to 'completed' status
 * 
 * @param {ObjectId} examId - The exam to complete
 * @returns {Object} Updated exam object
 */
async function completeExam(examId) {
  return await updateExamStatus(examId, 'completed');
}

/**
 * Transitions exam to 'graded' status
 * 
 * @param {ObjectId} examId - The exam to mark as graded
 * @returns {Object} Updated exam object
 */
async function markExamAsGraded(examId) {
  return await updateExamStatus(examId, 'graded');
}

/**
 * Transitions exam to 'published' status and sets publication timestamp
 * 
 * @param {ObjectId} examId - The exam to publish
 * @returns {Object} Updated exam object
 */
async function publishExam(examId) {
  try {
    const exam = await updateExamStatus(examId, 'published');
    
    // Set publication timestamp and flag
    exam.resultsPublished = true;
    exam.publishedAt = new Date();
    await exam.save();
    
    return exam;
  } catch (error) {
    console.error('Error publishing exam:', error);
    throw error;
  }
}

/**
 * Checks if all submissions for an exam are graded
 * 
 * @param {ObjectId} examId - The exam to check
 * @returns {Object} { allGraded: boolean, totalSubmissions: number, gradedCount: number }
 */
async function checkAllSubmissionsGraded(examId) {
  try {
    const totalSubmissions = await ExamSubmissionNew.countDocuments({
      exam: examId,
      status: { $in: ['submitted', 'graded'] }
    });
    
    const gradedCount = await ExamSubmissionNew.countDocuments({
      exam: examId,
      status: 'graded'
    });
    
    return {
      allGraded: totalSubmissions === gradedCount && totalSubmissions > 0,
      totalSubmissions,
      gradedCount,
      ungradedCount: totalSubmissions - gradedCount
    };
  } catch (error) {
    console.error('Error checking graded submissions:', error);
    throw error;
  }
}

/**
 * Calculates time remaining for an exam
 * 
 * @param {Object} exam - The exam object
 * @returns {number} Time remaining in seconds (0 if expired)
 */
function calculateTimeRemaining(exam) {
  const now = new Date();
  const endTime = new Date(exam.scheduledEndTime);
  
  // Check if late submission is allowed
  const effectiveEndTime = exam.allowLateSubmission && exam.lateSubmissionDeadline
    ? new Date(exam.lateSubmissionDeadline)
    : endTime;
  
  const timeRemaining = Math.floor((effectiveEndTime - now) / 1000);
  return Math.max(0, timeRemaining);
}

/**
 * Checks if exam is currently active (within time window)
 * 
 * @param {Object} exam - The exam object
 * @returns {boolean} True if exam is currently active
 */
function isExamActive(exam) {
  const now = new Date();
  const startTime = new Date(exam.scheduledStartTime);
  const endTime = new Date(exam.scheduledEndTime);
  
  // Check if late submission is allowed
  const effectiveEndTime = exam.allowLateSubmission && exam.lateSubmissionDeadline
    ? new Date(exam.lateSubmissionDeadline)
    : endTime;
  
  return now >= startTime && now <= effectiveEndTime;
}

/**
 * Checks if exam has started
 * 
 * @param {Object} exam - The exam object
 * @returns {boolean} True if exam has started
 */
function hasExamStarted(exam) {
  const now = new Date();
  const startTime = new Date(exam.scheduledStartTime);
  return now >= startTime;
}

/**
 * Checks if exam has ended
 * 
 * @param {Object} exam - The exam object
 * @returns {boolean} True if exam has ended (including late submission deadline)
 */
function hasExamEnded(exam) {
  const now = new Date();
  const endTime = new Date(exam.scheduledEndTime);
  
  // Check if late submission is allowed
  const effectiveEndTime = exam.allowLateSubmission && exam.lateSubmissionDeadline
    ? new Date(exam.lateSubmissionDeadline)
    : endTime;
  
  return now > effectiveEndTime;
}

module.exports = {
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
};
