/**
 * Auto-Grading Service for MCQ Questions
 * 
 * Automatically grades MCQ questions in exam submissions.
 * Handles negative marking, score calculation, and status updates.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 */

const ExamSubmissionNew = require('../models/examSubmissionNewModel');
const Exam = require('../models/examModel');

/**
 * Auto-grades MCQ questions in a submission
 * 
 * @preconditions:
 * - submission exists and has status 'submitted'
 * - submission has answers array with MCQ answers
 * - questions exist with correct options marked
 * 
 * @postconditions:
 * - Each MCQ answer has marksAwarded and isCorrect set
 * - submission.obtainedMarks calculated correctly
 * - submission.percentage calculated
 * - If all MCQ, status set to 'graded'
 * 
 * @param {ObjectId} submissionId - The submission to grade
 * @returns {Object} Grading summary with marks breakdown
 */
async function autoGradeMCQSubmission(submissionId) {
  // Step 1: Fetch submission with populated questions
  const submission = await ExamSubmissionNew.findById(submissionId)
    .populate('answers.question');
  
  if (!submission) {
    throw new Error('Submission not found');
  }
  
  if (submission.status !== 'submitted') {
    throw new Error('Can only grade submitted submissions');
  }
  
  // Step 2: Fetch exam to get totalMarks
  const exam = await Exam.findById(submission.exam);
  if (!exam) {
    throw new Error('Exam not found');
  }
  
  submission.totalMarks = exam.totalMarks;
  
  let obtainedMarks = 0;
  let mcqCount = 0;
  let correctCount = 0;
  
  // Step 3: Iterate through answers and grade MCQ questions
  // Loop invariant: obtainedMarks is sum of marks for all processed answers
  for (let i = 0; i < submission.answers.length; i++) {
    const answer = submission.answers[i];
    const question = answer.question;
    
    if (answer.questionType === 'mcq' && question) {
      mcqCount++;
      
      // Find correct option index
      const correctOptionIndex = question.options.findIndex(opt => opt.isCorrect);
      
      // Check if student's answer is correct
      if (answer.selectedOption === correctOptionIndex) {
        answer.isCorrect = true;
        answer.marksAwarded = question.marks;
        obtainedMarks += question.marks;
        correctCount++;
      } else {
        answer.isCorrect = false;
        answer.marksAwarded = -question.negativeMarks;
        obtainedMarks -= question.negativeMarks;
      }
    }
    // Maintain invariant: obtainedMarks updated for each processed answer
  }
  
  // Step 4: Ensure obtainedMarks is non-negative
  obtainedMarks = Math.max(0, obtainedMarks);
  
  // Step 5: Update submission with calculated marks
  submission.obtainedMarks = obtainedMarks;
  submission.percentage = (obtainedMarks / submission.totalMarks) * 100;
  
  // Step 6: If all questions are MCQ, set status to 'graded'
  if (mcqCount === submission.answers.length) {
    submission.status = 'graded';
    submission.gradedAt = new Date();
  }
  
  await submission.save();
  
  // Step 7: Return grading summary
  return {
    submissionId: submission._id,
    totalQuestions: submission.answers.length,
    mcqCount,
    correctCount,
    incorrectCount: mcqCount - correctCount,
    obtainedMarks,
    totalMarks: submission.totalMarks,
    percentage: submission.percentage,
    status: submission.status
  };
}

module.exports = {
  autoGradeMCQSubmission
};
