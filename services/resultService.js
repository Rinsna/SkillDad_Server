const { query } = require('../config/postgres');

/**
 * Generates results for all graded submissions in an exam using PostgreSQL
 * 
 * @param {string} examId - The exam to generate results for
 */
async function generateExamResults(examId) {
  // 1. Fetch exam
  const examRes = await query('SELECT * FROM exams WHERE id = $1', [examId]);
  const exam = examRes.rows[0];
  if (!exam) {
    throw new Error('Exam not found');
  }

  // 2. Fetch all graded submissions
  const subRes = await query(`
    SELECT * FROM exam_submissions_new 
    WHERE exam_id = $1 AND status = 'graded' 
    ORDER BY obtained_marks DESC
  `, [examId]);

  const submissions = subRes.rows;
  if (submissions.length === 0) return [];

  const results = [];
  let currentRank = 1;
  let studentsWithSameMarks = 0;
  let previousMarks = null;

  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];

    // Rank logic
    if (previousMarks !== null && parseFloat(sub.obtained_marks) === previousMarks) {
      studentsWithSameMarks++;
    } else {
      currentRank += studentsWithSameMarks;
      studentsWithSameMarks = 1;
    }
    previousMarks = parseFloat(sub.obtained_marks);

    const percentage = parseFloat(sub.percentage);
    let grade;
    if (percentage >= 90) grade = 'A+';
    else if (percentage >= 80) grade = 'A';
    else if (percentage >= 70) grade = 'B+';
    else if (percentage >= 60) grade = 'B';
    else if (percentage >= 50) grade = 'C';
    else if (percentage >= 40) grade = 'D';
    else grade = 'F';

    const isPassed = percentage >= parseFloat(exam.passing_score || 40);

    const resultId = `${examId}_${sub.student_id}`; // Composite-like ID for simplicity or use sub.id

    // Upsert into results table
    await query(`
      INSERT INTO results (id, exam_id, student_id, submission_id, total_marks, obtained_marks, percentage, grade, is_passed, rank, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        obtained_marks = EXCLUDED.obtained_marks,
        percentage = EXCLUDED.percentage,
        grade = EXCLUDED.grade,
        is_passed = EXCLUDED.is_passed,
        rank = EXCLUDED.rank,
        updated_at = NOW()
    `, [resultId, examId, sub.student_id, sub.id, sub.total_marks, sub.obtained_marks, sub.percentage, grade, isPassed, currentRank]);

    results.push({ student_id: sub.student_id, rank: currentRank, grade });
  }

  return results;
}

module.exports = {
  generateExamResults
};
