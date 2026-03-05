/**
 * Manual Test Script for Result Generation
 * 
 * This script demonstrates the result generation and ranking logic
 * Run with: node tests/resultGeneration.manual.js
 */

// Mock data to demonstrate the ranking algorithm
const mockSubmissions = [
  { student: 'Student A', obtainedMarks: 95, percentage: 95 },
  { student: 'Student B', obtainedMarks: 85, percentage: 85 },
  { student: 'Student C', obtainedMarks: 85, percentage: 85 }, // Tied with B
  { student: 'Student D', obtainedMarks: 70, percentage: 70 },
  { student: 'Student E', obtainedMarks: 35, percentage: 35 }
];

// Simulate the ranking algorithm
function calculateRankings(submissions) {
  const sorted = [...submissions].sort((a, b) => b.obtainedMarks - a.obtainedMarks);
  
  let currentRank = 1;
  let studentsWithSameMarks = 0;
  let previousMarks = null;
  
  const results = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const submission = sorted[i];
    
    // Check if marks are same as previous student
    if (previousMarks !== null && submission.obtainedMarks === previousMarks) {
      studentsWithSameMarks++;
    } else {
      // New marks group - update rank
      currentRank += studentsWithSameMarks;
      studentsWithSameMarks = 1;
    }
    
    previousMarks = submission.obtainedMarks;
    
    // Calculate grade based on percentage
    const percentage = submission.percentage;
    let grade;
    if (percentage >= 90) grade = 'A+';
    else if (percentage >= 80) grade = 'A';
    else if (percentage >= 70) grade = 'B+';
    else if (percentage >= 60) grade = 'B';
    else if (percentage >= 50) grade = 'C';
    else if (percentage >= 40) grade = 'D';
    else grade = 'F';
    
    // Determine pass/fail (assuming 40% passing score)
    const isPassed = percentage >= 40;
    
    results.push({
      student: submission.student,
      obtainedMarks: submission.obtainedMarks,
      percentage: submission.percentage,
      grade,
      isPassed,
      rank: currentRank
    });
  }
  
  return results;
}

// Run the test
console.log('=== Result Generation and Ranking Test ===\n');
console.log('Input Submissions:');
console.table(mockSubmissions);

const results = calculateRankings(mockSubmissions);

console.log('\nGenerated Results with Rankings:');
console.table(results);

// Verify expectations
console.log('\n=== Verification ===');
console.log('✓ Student A (95 marks) should have Rank 1:', results[0].rank === 1 ? 'PASS' : 'FAIL');
console.log('✓ Students B and C (85 marks) should both have Rank 2:', 
  results[1].rank === 2 && results[2].rank === 2 ? 'PASS' : 'FAIL');
console.log('✓ Student D (70 marks) should have Rank 4 (not 3):', results[3].rank === 4 ? 'PASS' : 'FAIL');
console.log('✓ Student E (35 marks) should have Rank 5:', results[4].rank === 5 ? 'PASS' : 'FAIL');
console.log('✓ Grade A+ for 95%:', results[0].grade === 'A+' ? 'PASS' : 'FAIL');
console.log('✓ Grade A for 85%:', results[1].grade === 'A' ? 'PASS' : 'FAIL');
console.log('✓ Grade B+ for 70%:', results[3].grade === 'B+' ? 'PASS' : 'FAIL');
console.log('✓ Grade F for 35%:', results[4].grade === 'F' ? 'PASS' : 'FAIL');
console.log('✓ Student E (35%) should fail:', results[4].isPassed === false ? 'PASS' : 'FAIL');
console.log('✓ All others should pass:', 
  results.slice(0, 4).every(r => r.isPassed) ? 'PASS' : 'FAIL');

console.log('\n=== Test Complete ===');
