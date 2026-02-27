const MonitoringAlertJob = require('./monitoringAlertJob');
require('dotenv').config();
const connectDB = require('../config/db');

/**
 * Test script for Monitoring Alert Job
 * 
 * This script tests the monitoring alert job functionality:
 * - Checks system health
 * - Detects threshold breaches
 * - Sends alerts to admins
 */

async function testMonitoringAlertJob() {
  console.log('='.repeat(60));
  console.log('Testing Monitoring Alert Job');
  console.log('='.repeat(60));

  try {
    // Connect to database
    console.log('\n1. Connecting to database...');
    await connectDB();
    console.log('✓ Database connected');

    // Create job instance
    const job = new MonitoringAlertJob();

    // Run the job manually
    console.log('\n2. Running monitoring alert job...');
    await job.runManually();

    // Get job status
    console.log('\n3. Job Status:');
    const status = job.getStatus();
    console.log(JSON.stringify(status, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('Test completed successfully!');
    console.log('='.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testMonitoringAlertJob();
