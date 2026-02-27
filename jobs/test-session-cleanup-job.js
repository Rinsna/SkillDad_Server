const SessionCleanupJob = require('./sessionCleanupJob');
require('dotenv').config();
const connectDB = require('../config/db');

/**
 * Test Session Cleanup Job
 * 
 * This script allows you to test the session cleanup job manually
 * without waiting for the scheduled time.
 * 
 * Usage: node jobs/test-session-cleanup-job.js
 */

async function testSessionCleanupJob() {
  console.log('='.repeat(60));
  console.log('Testing Session Cleanup Job');
  console.log('='.repeat(60));
  console.log();

  try {
    // Connect to database
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected successfully');
    console.log();

    // Create job instance
    const job = new SessionCleanupJob();

    // Run the job manually
    console.log('Running session cleanup job...');
    console.log();
    
    await job.runManually();
    
    console.log();
    console.log('='.repeat(60));
    console.log('Job Status:');
    console.log('='.repeat(60));
    console.log(JSON.stringify(job.getStatus(), null, 2));
    console.log();

    console.log('Test completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testSessionCleanupJob();
