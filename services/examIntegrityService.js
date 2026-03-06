const auditLogService = require('./auditLogService');

/**
 * Exam Integrity Service
 * Handles exam security measures including question shuffling,
 * option randomization, and answer change tracking
 */

/**
 * Shuffle array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Shuffle questions if exam configuration requires it
 * @param {Array} questions - Array of question objects
 * @param {boolean} shouldShuffle - Whether to shuffle
 * @returns {Array} Shuffled or original questions
 */
function shuffleQuestions(questions, shouldShuffle) {
  if (!shouldShuffle || !questions || questions.length === 0) {
    return questions;
  }
  
  return shuffleArray(questions);
}

/**
 * Randomize MCQ options while maintaining correct answer tracking
 * @param {Object} question - Question object with options
 * @returns {Object} Question with randomized options and mapping
 */
function randomizeMCQOptions(question) {
  if (question.questionType !== 'mcq' || !question.options || question.options.length === 0) {
    return question;
  }

  // Create a copy of the question
  const questionCopy = JSON.parse(JSON.stringify(question));
  
  // Store original indices
  const optionsWithIndices = questionCopy.options.map((opt, index) => ({
    ...opt,
    originalIndex: index
  }));

  // Shuffle options
  const shuffledOptions = shuffleArray(optionsWithIndices);

  // Create mapping from new index to original index
  const optionMapping = {};
  shuffledOptions.forEach((opt, newIndex) => {
    optionMapping[newIndex] = opt.originalIndex;
  });

  // Remove originalIndex from options before sending to client
  questionCopy.options = shuffledOptions.map(opt => ({
    text: opt.text,
    // Don't send isCorrect to client
  }));

  // Store mapping for answer validation (server-side only)
  questionCopy.optionMapping = optionMapping;

  return questionCopy;
}

/**
 * Process questions for exam delivery with security measures
 * @param {Array} questions - Array of questions
 * @param {Object} examConfig - Exam configuration
 * @returns {Array} Processed questions
 */
function processQuestionsForDelivery(questions, examConfig) {
  let processedQuestions = [...questions];

  // Shuffle questions if configured
  if (examConfig.shuffleQuestions) {
    processedQuestions = shuffleQuestions(processedQuestions, true);
  }

  // Randomize MCQ options and sanitize
  processedQuestions = processedQuestions.map(q => {
    const questionObj = q.toObject ? q.toObject() : q;
    
    // Randomize MCQ options
    if (questionObj.questionType === 'mcq') {
      const randomized = randomizeMCQOptions(questionObj);
      
      // Remove sensitive data
      delete randomized.optionMapping; // Don't send to client
      randomized.options = randomized.options.map(opt => ({
        text: opt.text
        // isCorrect is already removed
      }));
      
      return randomized;
    }
    
    return questionObj;
  });

  return processedQuestions;
}

/**
 * Log answer change for tracking
 * @param {string} submissionId - Submission ID
 * @param {string} questionId - Question ID
 * @param {*} oldAnswer - Previous answer
 * @param {*} newAnswer - New answer
 * @param {string} userId - User ID
 * @param {Object} req - Express request object
 */
async function logAnswerChange(submissionId, questionId, oldAnswer, newAnswer, userId, req) {
  try {
    await auditLogService.logAuditEvent({
      userId,
      action: 'answer_changed',
      resource: 'submission',
      resourceId: submissionId,
      details: {
        questionId,
        oldAnswer: oldAnswer ? JSON.stringify(oldAnswer) : null,
        newAnswer: newAnswer ? JSON.stringify(newAnswer) : null,
        timestamp: new Date()
      },
      ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
      userAgent: req.get('user-agent') || 'unknown'
    });
  } catch (error) {
    console.error('Error logging answer change:', error);
    // Don't throw error - logging failure shouldn't break submission
  }
}

/**
 * Track answer change in submission document
 * @param {Object} submission - Submission document
 * @param {string} questionId - Question ID
 * @param {*} newAnswer - New answer
 */
function trackAnswerChange(submission, questionId, newAnswer) {
  // Initialize answer change tracking if not exists
  if (!submission.answerChanges) {
    submission.answerChanges = [];
  }

  // Find existing answer
  const existingAnswer = submission.answers.find(
    a => a.question.toString() === questionId.toString()
  );

  // Record change
  submission.answerChanges.push({
    questionId,
    previousAnswer: existingAnswer ? {
      selectedOption: existingAnswer.selectedOption,
      textAnswer: existingAnswer.textAnswer
    } : null,
    newAnswer: {
      selectedOption: newAnswer.selectedOption,
      textAnswer: newAnswer.textAnswer
    },
    changedAt: new Date()
  });
}

/**
 * Validate answer submission integrity
 * @param {Object} submission - Submission document
 * @param {Object} exam - Exam document
 * @returns {Object} { valid: boolean, reason?: string }
 */
function validateSubmissionIntegrity(submission, exam) {
  // Check if submission is within time window
  const now = new Date();
  const startTime = new Date(submission.startedAt);
  const examDuration = exam.duration * 60 * 1000; // Convert to milliseconds
  const expectedEndTime = new Date(startTime.getTime() + examDuration);

  if (now > expectedEndTime) {
    return {
      valid: false,
      reason: 'Submission time exceeded exam duration'
    };
  }

  // Check if submission status is valid
  if (submission.status !== 'in-progress') {
    return {
      valid: false,
      reason: 'Submission is not in progress'
    };
  }

  return { valid: true };
}

/**
 * Get exam access statistics for monitoring
 * @param {string} examId - Exam ID
 * @returns {Promise<Object>} Access statistics
 */
async function getExamAccessStats(examId) {
  try {
    const stats = await auditLogService.getAuditLogs({
      resource: 'exam',
      resourceId: examId,
      action: { $in: ['exam_access_granted', 'exam_access_denied', 'exam_started'] }
    });

    const accessGranted = stats.filter(s => s.action === 'exam_access_granted').length;
    const accessDenied = stats.filter(s => s.action === 'exam_access_denied').length;
    const examStarted = stats.filter(s => s.action === 'exam_started').length;

    return {
      accessGranted,
      accessDenied,
      examStarted,
      totalAttempts: accessGranted + accessDenied
    };
  } catch (error) {
    console.error('Error getting exam access stats:', error);
    return {
      accessGranted: 0,
      accessDenied: 0,
      examStarted: 0,
      totalAttempts: 0
    };
  }
}

/**
 * Detect suspicious activity patterns
 * @param {Object} submission - Submission document
 * @returns {Array} Array of suspicious activity flags
 */
function detectSuspiciousActivity(submission) {
  const flags = [];

  // Check for rapid answer changes
  if (submission.answerChanges && submission.answerChanges.length > 0) {
    const changes = submission.answerChanges;
    
    // Group changes by question
    const changesByQuestion = {};
    changes.forEach(change => {
      const qId = change.questionId.toString();
      if (!changesByQuestion[qId]) {
        changesByQuestion[qId] = [];
      }
      changesByQuestion[qId].push(change);
    });

    // Flag questions with excessive changes (>5 changes)
    Object.keys(changesByQuestion).forEach(qId => {
      if (changesByQuestion[qId].length > 5) {
        flags.push({
          type: 'excessive_changes',
          questionId: qId,
          changeCount: changesByQuestion[qId].length,
          message: `Question changed ${changesByQuestion[qId].length} times`
        });
      }
    });

    // Check for rapid consecutive changes (< 2 seconds apart)
    for (let i = 1; i < changes.length; i++) {
      const timeDiff = new Date(changes[i].changedAt) - new Date(changes[i-1].changedAt);
      if (timeDiff < 2000) { // Less than 2 seconds
        flags.push({
          type: 'rapid_changes',
          timestamp: changes[i].changedAt,
          message: 'Rapid consecutive answer changes detected'
        });
      }
    }
  }

  // Check for unusually fast completion
  if (submission.submittedAt && submission.startedAt) {
    const timeSpent = (new Date(submission.submittedAt) - new Date(submission.startedAt)) / 1000;
    const expectedMinTime = submission.answers.length * 30; // 30 seconds per question minimum
    
    if (timeSpent < expectedMinTime) {
      flags.push({
        type: 'fast_completion',
        timeSpent,
        expectedMinTime,
        message: `Exam completed in ${timeSpent}s, expected minimum ${expectedMinTime}s`
      });
    }
  }

  return flags;
}

module.exports = {
  shuffleArray,
  shuffleQuestions,
  randomizeMCQOptions,
  processQuestionsForDelivery,
  logAnswerChange,
  trackAnswerChange,
  validateSubmissionIntegrity,
  getExamAccessStats,
  detectSuspiciousActivity
};
