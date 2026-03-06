/**
 * Script to verify database indexes are created and being used
 * Run with: node server/scripts/verifyIndexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models to ensure indexes are defined
const Exam = require('../models/examModel');
const Question = require('../models/questionModel');
const ExamSubmissionNew = require('../models/examSubmissionNewModel');
const Result = require('../models/resultModel');

async function verifyIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Verify Exam indexes
    console.log('=== EXAM MODEL INDEXES ===');
    const examIndexes = await Exam.collection.getIndexes();
    console.log(JSON.stringify(examIndexes, null, 2));

    // Verify Question indexes
    console.log('\n=== QUESTION MODEL INDEXES ===');
    const questionIndexes = await Question.collection.getIndexes();
    console.log(JSON.stringify(questionIndexes, null, 2));

    // Verify ExamSubmissionNew indexes
    console.log('\n=== EXAM SUBMISSION MODEL INDEXES ===');
    const submissionIndexes = await ExamSubmissionNew.collection.getIndexes();
    console.log(JSON.stringify(submissionIndexes, null, 2));

    // Verify Result indexes
    console.log('\n=== RESULT MODEL INDEXES ===');
    const resultIndexes = await Result.collection.getIndexes();
    console.log(JSON.stringify(resultIndexes, null, 2));

    // Test query performance with explain
    console.log('\n=== QUERY PERFORMANCE TESTS ===');

    // Test 1: Find exams by course and status
    console.log('\n1. Find exams by course and status:');
    const explain1 = await Exam.find({ 
      course: new mongoose.Types.ObjectId(),
      status: 'scheduled' 
    }).explain('executionStats');
    console.log(`Index used: ${explain1.executionStats.executionStages.inputStage?.indexName || 'NONE'}`);
    console.log(`Docs examined: ${explain1.executionStats.totalDocsExamined}`);

    // Test 2: Find submissions by exam and status
    console.log('\n2. Find submissions by exam and status:');
    const explain2 = await ExamSubmissionNew.find({ 
      exam: new mongoose.Types.ObjectId(),
      status: 'submitted' 
    }).explain('executionStats');
    console.log(`Index used: ${explain2.executionStats.executionStages.inputStage?.indexName || 'NONE'}`);
    console.log(`Docs examined: ${explain2.executionStats.totalDocsExamined}`);

    // Test 3: Find results by exam and rank
    console.log('\n3. Find results by exam and rank:');
    const explain3 = await Result.find({ 
      exam: new mongoose.Types.ObjectId()
    }).sort({ rank: 1 }).explain('executionStats');
    console.log(`Index used: ${explain3.executionStats.executionStages.inputStage?.indexName || 'NONE'}`);
    console.log(`Docs examined: ${explain3.executionStats.totalDocsExamined}`);

    // Test 4: Find questions by exam and order
    console.log('\n4. Find questions by exam and order:');
    const explain4 = await Question.find({ 
      exam: new mongoose.Types.ObjectId()
    }).sort({ order: 1 }).explain('executionStats');
    console.log(`Index used: ${explain4.executionStats.executionStages.inputStage?.indexName || 'NONE'}`);
    console.log(`Docs examined: ${explain4.executionStats.totalDocsExamined}`);

    // Test 5: Find student submissions by createdAt
    console.log('\n5. Find student submissions by createdAt:');
    const explain5 = await ExamSubmissionNew.find({ 
      student: new mongoose.Types.ObjectId()
    }).sort({ createdAt: -1 }).explain('executionStats');
    console.log(`Index used: ${explain5.executionStats.executionStages.inputStage?.indexName || 'NONE'}`);
    console.log(`Docs examined: ${explain5.executionStats.totalDocsExamined}`);

    console.log('\n✅ Index verification complete');

  } catch (error) {
    console.error('Error verifying indexes:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run verification
verifyIndexes();
