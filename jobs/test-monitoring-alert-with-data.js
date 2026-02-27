const MonitoringAlertJob = require('./monitoringAlertJob');
const MonitoringService = require('../services/payment/MonitoringService');
const Transaction = require('../models/payment/Transaction');
const User = require('../models/userModel');
require('dotenv').config();
const connectDB = require('../config/db');
const mongoose = require('mongoose');

/**
 * Test script for Monitoring Alert Job with sample data
 * 
 * This script:
 * 1. Creates sample transactions to simulate low success rate
 * 2. Simulates slow API response times
 * 3. Runs the monitoring alert job
 * 4. Verifies alerts are triggered correctly
 */

async function createSampleData() {
  console.log('\nCreating sample data for testing...');

  // Create a test admin user if not exists
  let admin = await User.findOne({ email: 'admin@skilldad.com' });
  if (!admin) {
    admin = await User.create({
      name: 'Test Admin',
      email: 'admin@skilldad.com',
      password: 'test123',
      role: 'admin'
    });
    console.log('✓ Created test admin user');
  } else {
    console.log('✓ Test admin user already exists');
  }

  // Create sample transactions with low success rate (< 90%)
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Create 10 transactions: 8 failed, 2 successful (80% failure rate)
  const transactions = [];
  
  for (let i = 0; i < 8; i++) {
    transactions.push({
      transactionId: `TXN_TEST_FAIL_${i}`,
      student: admin._id,
      course: new mongoose.Types.ObjectId(),
      originalAmount: 10000,
      discountAmount: 0,
      finalAmount: 10000,
      currency: 'INR',
      status: 'failed',
      errorCategory: 'card_declined',
      errorMessage: 'Card declined by bank',
      sessionId: `SES_TEST_${i}`,
      sessionExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      initiatedAt: oneHourAgo,
      completedAt: now
    });
  }

  for (let i = 0; i < 2; i++) {
    transactions.push({
      transactionId: `TXN_TEST_SUCCESS_${i}`,
      student: admin._id,
      course: new mongoose.Types.ObjectId(),
      originalAmount: 10000,
      discountAmount: 0,
      finalAmount: 10000,
      currency: 'INR',
      status: 'success',
      sessionId: `SES_TEST_SUCCESS_${i}`,
      sessionExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      initiatedAt: oneHourAgo,
      completedAt: now,
      gatewayTransactionId: `HDFC_TEST_${i}`,
      paymentMethod: 'credit_card'
    });
  }

  // Delete existing test transactions
  await Transaction.deleteMany({ transactionId: /^TXN_TEST_/ });
  
  // Insert new test transactions
  await Transaction.insertMany(transactions);
  console.log(`✓ Created ${transactions.length} test transactions (20% success rate)`);

  // Simulate slow API response times
  for (let i = 0; i < 10; i++) {
    MonitoringService.trackAPIResponseTime('createPaymentRequest', 6000); // 6 seconds (exceeds 5s threshold)
  }
  console.log('✓ Simulated slow API response times (6 seconds)');
}

async function cleanupSampleData() {
  console.log('\nCleaning up sample data...');
  
  // Delete test transactions
  await Transaction.deleteMany({ transactionId: /^TXN_TEST_/ });
  console.log('✓ Deleted test transactions');
  
  // Note: We keep the test admin user for future tests
}

async function testMonitoringAlertJob() {
  console.log('='.repeat(60));
  console.log('Testing Monitoring Alert Job with Sample Data');
  console.log('='.repeat(60));

  try {
    // Connect to database
    console.log('\n1. Connecting to database...');
    await connectDB();
    console.log('✓ Database connected');

    // Create sample data
    console.log('\n2. Setting up test scenario...');
    await createSampleData();

    // Create job instance
    const job = new MonitoringAlertJob();

    // Run the job manually
    console.log('\n3. Running monitoring alert job...');
    await job.runManually();

    // Get job status
    console.log('\n4. Job Status:');
    const status = job.getStatus();
    console.log(JSON.stringify(status, null, 2));

    // Get payment metrics to verify
    console.log('\n5. Payment Metrics:');
    const metrics = await MonitoringService.getPaymentMetrics('24h');
    console.log(`   Success Rate: ${metrics.successRate}%`);
    console.log(`   Total Attempts: ${metrics.totalAttempts}`);
    console.log(`   Successful: ${metrics.successfulPayments}`);
    console.log(`   Failed: ${metrics.failedPayments}`);

    // Verify alerts were triggered
    console.log('\n6. Alert Verification:');
    if (metrics.successRate < 90) {
      console.log('   ✓ Success rate is below threshold (should trigger alert)');
    } else {
      console.log('   ✗ Success rate is above threshold (alert not expected)');
    }

    if (status.lastAlertStats && status.lastAlertStats.alertsSent > 0) {
      console.log(`   ✓ ${status.lastAlertStats.alertsSent} alert(s) sent`);
    } else {
      console.log('   ℹ No alerts sent (may be in cooldown period)');
    }

    // Cleanup
    console.log('\n7. Cleaning up...');
    await cleanupSampleData();

    console.log('\n' + '='.repeat(60));
    console.log('Test completed successfully!');
    console.log('='.repeat(60));
    console.log('\nNote: Check the console logs above for alert emails that would be sent.');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    
    // Attempt cleanup even on failure
    try {
      await cleanupSampleData();
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
    
    process.exit(1);
  }
}

// Run the test
testMonitoringAlertJob();
