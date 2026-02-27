const SessionCleanupJob = require('./sessionCleanupJob');
const Transaction = require('../models/payment/Transaction');
const PaymentSession = require('../models/payment/PaymentSession');
require('dotenv').config();
const connectDB = require('../config/db');

/**
 * Test Session Cleanup Job with Sample Data
 * 
 * This script creates test data (expired sessions and transactions)
 * and then runs the cleanup job to verify it works correctly.
 * 
 * Usage: node jobs/test-session-cleanup-with-data.js
 */

async function createTestData() {
  console.log('Creating test data...');
  
  // Create a test transaction
  const testTransaction = await Transaction.create({
    transactionId: `TEST_${Date.now()}`,
    student: '507f1f77bcf86cd799439011', // Dummy student ID
    course: '507f1f77bcf86cd799439012', // Dummy course ID
    originalAmount: 10000,
    discountAmount: 0,
    finalAmount: 10000,
    gstAmount: 1800,
    currency: 'INR',
    status: 'pending',
    sessionId: `SES_TEST_${Date.now()}`,
    sessionExpiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
    initiatedAt: new Date(Date.now() - 900000), // 15 minutes ago
  });

  // Create an expired payment session
  const testSession = await PaymentSession.create({
    sessionId: testTransaction.sessionId,
    transactionId: testTransaction.transactionId,
    student: testTransaction.student,
    course: testTransaction.course,
    amount: testTransaction.finalAmount,
    status: 'active',
    expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
    createdAt: new Date(Date.now() - 900000), // 15 minutes ago
  });

  console.log('Test data created:');
  console.log(`  Transaction ID: ${testTransaction.transactionId}`);
  console.log(`  Session ID: ${testSession.sessionId}`);
  console.log(`  Transaction Status: ${testTransaction.status}`);
  console.log(`  Session Status: ${testSession.status}`);
  console.log();

  return { testTransaction, testSession };
}

async function verifyCleanup(transactionId, sessionId) {
  console.log('Verifying cleanup results...');
  
  const transaction = await Transaction.findOne({ transactionId });
  const session = await PaymentSession.findOne({ sessionId });

  console.log('After cleanup:');
  console.log(`  Transaction Status: ${transaction.status}`);
  console.log(`  Transaction Error Category: ${transaction.errorCategory}`);
  console.log(`  Session Status: ${session.status}`);
  console.log();

  // Verify the cleanup worked correctly
  if (transaction.status === 'failed' && transaction.errorCategory === 'expired' && session.status === 'expired') {
    console.log('✓ Cleanup successful! Transaction marked as failed (expired) and session marked as expired.');
    return true;
  } else {
    console.log('✗ Cleanup failed! Status not updated correctly.');
    return false;
  }
}

async function cleanup(transactionId, sessionId) {
  console.log('Cleaning up test data...');
  await Transaction.deleteOne({ transactionId });
  await PaymentSession.deleteOne({ sessionId });
  console.log('Test data cleaned up');
}

async function testSessionCleanupJob() {
  console.log('='.repeat(60));
  console.log('Testing Session Cleanup Job with Sample Data');
  console.log('='.repeat(60));
  console.log();

  try {
    // Connect to database
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected successfully');
    console.log();

    // Create test data
    const { testTransaction, testSession } = await createTestData();

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

    // Verify cleanup
    const success = await verifyCleanup(testTransaction.transactionId, testSession.sessionId);

    // Clean up test data
    await cleanup(testTransaction.transactionId, testSession.sessionId);

    console.log();
    if (success) {
      console.log('✓ Test completed successfully!');
      process.exit(0);
    } else {
      console.log('✗ Test failed!');
      process.exit(1);
    }

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testSessionCleanupJob();
