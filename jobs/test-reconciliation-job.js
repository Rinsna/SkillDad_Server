/**
 * Manual Test Script for Daily Reconciliation Job
 * 
 * This script allows you to test the reconciliation job manually
 * without waiting for the scheduled time.
 * 
 * Usage: node jobs/test-reconciliation-job.js
 */

const dotenv = require('dotenv');
const connectDB = require('../config/db');
const DailyReconciliationJob = require('./dailyReconciliationJob');

// Load environment variables
dotenv.config();

async function testReconciliationJob() {
  console.log('='.repeat(60));
  console.log('Testing Daily Reconciliation Job');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Connect to database
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected successfully');
    console.log('');

    // Create job instance
    const job = new DailyReconciliationJob();

    // Initialize services
    console.log('Initializing services...');
    job.initializeServices();
    console.log('Services initialized successfully');
    console.log('');

    // Get previous day range
    const { startDate, endDate } = job.getPreviousDayRange();
    console.log('Date Range:');
    console.log(`  Start: ${startDate.toISOString()}`);
    console.log(`  End:   ${endDate.toISOString()}`);
    console.log('');

    // Get finance emails
    const financeEmails = job.getFinanceEmails();
    console.log('Finance Team Emails:');
    if (financeEmails.length > 0) {
      financeEmails.forEach(email => console.log(`  - ${email}`));
    } else {
      console.log('  (No emails configured)');
    }
    console.log('');

    // Run the job
    console.log('Running reconciliation job...');
    console.log('');
    await job.runManually();
    console.log('');

    // Get job status
    const status = job.getStatus();
    console.log('Job Status:');
    console.log(`  Last Run: ${status.lastRunTime ? status.lastRunTime.toISOString() : 'Never'}`);
    console.log(`  Status: ${status.lastRunStatus || 'N/A'}`);
    if (status.lastError) {
      console.log(`  Error: ${status.lastError}`);
    }
    console.log('');

    console.log('='.repeat(60));
    console.log('Test completed successfully');
    console.log('='.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('Test failed with error:');
    console.error(error);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Run the test
testReconciliationJob();
