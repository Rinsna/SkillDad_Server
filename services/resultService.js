const ExamSubmissionNew = require('../models/examSubmissionNewModel');
const Exam = require('../models/examModel');
const Result = require('../models/resultModel');
const mongoose = require('mongoose');

/**
 * Generates results for all graded submissions in an exam
 * Calculates rankings with tie handling
 * 
 * @param {ObjectId} examId - The exam to generate results for
 * @returns {Array} Array of generated results
 */
async function generateExamResults(examId) {
  // Step 1: Fetch exam
  const exam = await Exam.findById(examId);
  if (!exam) {
    throw new Error('Exam not found');
  }
  
  // Step 2: Fetch all graded submissions, sorted by obtainedMarks descending
  const submissions = await ExamSubmissionNew.find({
    exam: examId,
    status: 'graded'
  }).sort({ obtainedMarks: -1 });
  
  if (submissions.length === 0) {
    return [];
  }
  
  // Step 3: Calculate rankings with tie handling
  let currentRank = 1;
  let studentsWithSameMarks = 0;
  let previousMarks = null;
  
  const results = [];
  
  for (let i = 0; i < submissions.length; i++) {
    const submission = submissions[i];
    
    // Check if marks are same as previous student
    if (previousMarks !== null && submission.obtainedMarks === previousMarks) {
      studentsWithSameMarks++;
    } else {
      // New marks group - update rank
      currentRank += studentsWithSameMarks;
      studentsWithSameMarks = 1;
    }
    
    previousMarks = submission.obtainedMarks;
    
    // Step 4: Calculate grade based on percentage
    const percentage = submission.percentage;
    let grade;
    if (percentage >= 90) grade = 'A+';
    else if (percentage >= 80) grade = 'A';
    else if (percentage >= 70) grade = 'B+';
    else if (percentage >= 60) grade = 'B';
    else if (percentage >= 50) grade = 'C';
    else if (percentage >= 40) grade = 'D';
    else grade = 'F';
    
    // Step 5: Determine pass/fail
    const isPassed = percentage >= (exam.passingScore || 40);
    
    // Step 6: Create or update Result document
    const resultData = {
      exam: examId,
      student: submission.student,
      submission: submission._id,
      totalMarks: submission.totalMarks,
      obtainedMarks: submission.obtainedMarks,
      percentage: submission.percentage,
      grade,
      isPassed,
      rank: currentRank,
      isPublished: false,
      generatedBy: submission.gradedBy
    };
    
    const result = await Result.findOneAndUpdate(
      { exam: examId, student: submission.student },
      resultData,
      { upsert: true, new: true }
    );
    
    results.push(result);
  }
  
  return results;
}

module.exports = {
  generateExamResults
};
