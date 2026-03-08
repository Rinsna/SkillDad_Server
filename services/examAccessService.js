const { query } = require('../config/postgres');

/**
 * Exam Access Control Service using PostgreSQL
 * Handles exam access validation and status management
 */

/**
 * Checks if a student can access an exam
 * 
 * @param {string} examId - The exam to check access for
 * @param {string} studentId - The student requesting access
 * @returns {Object} { canAccess: boolean, reason: string, timeRemaining?: number, exam?: Object }
 */
async function checkExamAccess(examId, studentId) {
  try {
    // 1. Fetch exam from PG
    const examRes = await query('SELECT * FROM exams WHERE id = $1', [examId]);
    const exam = examRes.rows[0];

    if (!exam) {
      return { canAccess: false, reason: 'Exam not found' };
    }

    // 2. Verify student enrollment in course from PG
    const enrollRes = await query(`
        SELECT * FROM enrollments 
        WHERE student_id = $1 AND course_id = $2 AND status = 'active'
    `, [studentId.toString(), exam.course_id]);

    if (enrollRes.rows.length === 0) {
      return { canAccess: false, reason: 'Not enrolled in course' };
    }

    // 3. Check exam status
    const restrictedStatuses = ['completed', 'graded', 'published'];
    if (restrictedStatuses.includes(exam.status)) {
      return { canAccess: false, reason: 'Exam has ended' };
    }

    // 4. Check time window
    const now = new Date();
    const startTime = new Date(exam.scheduled_start_time);
    const endTime = new Date(exam.scheduled_end_time);

    if (now < startTime) {
      const minutesUntilStart = Math.floor((startTime - now) / 60000);
      return {
        canAccess: false,
        reason: `Exam starts in ${minutesUntilStart} minutes`,
        startsAt: startTime
      };
    }

    if (now > endTime) {
      if (!exam.allow_late_submission) {
        return { canAccess: false, reason: 'Exam time has expired' };
      }
      const lateDeadline = new Date(exam.late_submission_deadline);
      if (now > lateDeadline) {
        return { canAccess: false, reason: 'Late submission deadline passed' };
      }
    }

    // 5. Check for existing submission in PG
    const subRes = await query(`
        SELECT * FROM exam_submissions_new 
        WHERE exam_id = $1 AND student_id = $2 AND status IN ('submitted', 'graded')
    `, [examId, studentId.toString()]);

    if (subRes.rows.length > 0) {
      return { canAccess: false, reason: 'Already submitted' };
    }

    // 6. Calculate time remaining
    const effectiveEndTime = exam.allow_late_submission && exam.late_submission_deadline
      ? new Date(exam.late_submission_deadline)
      : endTime;

    const timeRemaining = Math.floor((effectiveEndTime - now) / 1000); // seconds

    return {
      canAccess: true,
      reason: 'Access granted',
      timeRemaining: Math.max(0, timeRemaining),
      exam // Returning the Postgres row object
    };
  } catch (error) {
    console.error('Error checking exam access (PG):', error);
    throw error;
  }
}

module.exports = {
  checkExamAccess,
  // Other methods if needed can be added here or kept as stubs
  isExamActive: (exam) => {
    const now = new Date();
    const startTime = new Date(exam.scheduled_start_time);
    const endTime = new Date(exam.scheduled_end_time);
    return now >= startTime && now <= endTime;
  }
};
