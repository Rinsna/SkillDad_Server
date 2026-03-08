const { query } = require('../config/postgres');

/**
 * Auto-grades MCQ questions in a submission using PostgreSQL
 * 
 * @param {string} submissionId - The submission to grade
 * @returns {Object} Grading summary
 */
async function autoGradeMCQSubmission(submissionId) {
  // 1. Fetch submission and questions in one go if possible, or separately
  const subRes = await query('SELECT * FROM exam_submissions_new WHERE id = $1', [submissionId]);
  const submission = subRes.rows[0];

  if (!submission) {
    throw new Error('Submission not found');
  }

  const examRes = await query('SELECT * FROM exams WHERE id = $1', [submission.exam_id]);
  const exam = examRes.rows[0];
  if (!exam) {
    throw new Error('Exam not found');
  }

  const qRes = await query('SELECT * FROM questions WHERE exam_id = $1', [submission.exam_id]);
  const questions = qRes.rows;

  let obtainedMarks = 0;
  let mcqCount = 0;
  let correctCount = 0;
  let answers = submission.answers || [];

  // Grade each answer
  for (let answer of answers) {
    const question = questions.find(q => q.id === (answer.questionId || answer.question));
    if (question && question.question_type === 'mcq') {
      mcqCount++;
      const options = question.options; // This is a JSONB array
      const correctOptionIndex = options.findIndex(opt => opt.isCorrect);

      if (answer.selectedOption === correctOptionIndex) {
        answer.isCorrect = true;
        answer.marksAwarded = parseFloat(question.marks);
        obtainedMarks += parseFloat(question.marks);
        correctCount++;
      } else {
        answer.isCorrect = false;
        answer.marksAwarded = -parseFloat(question.negative_marks || 0);
        obtainedMarks -= parseFloat(question.negative_marks || 0);
      }
    }
  }

  obtainedMarks = Math.max(0, obtainedMarks);
  const totalMarks = parseFloat(exam.total_points || 100);
  const percentage = (obtainedMarks / totalMarks) * 100;

  // Update PG
  await query(`
    UPDATE exam_submissions_new 
    SET obtained_marks = $1, 
        percentage = $2, 
        status = CASE WHEN $3 = $4 THEN 'graded' ELSE status END,
        graded_at = CASE WHEN $3 = $4 THEN NOW() ELSE graded_at END,
        answers = $5,
        total_marks = $6
    WHERE id = $7
  `, [obtainedMarks, percentage, mcqCount, answers.length, JSON.stringify(answers), totalMarks, submissionId]);

  return {
    submissionId,
    mcqCount,
    correctCount,
    obtainedMarks,
    percentage
  };
}

module.exports = {
  autoGradeMCQSubmission
};
