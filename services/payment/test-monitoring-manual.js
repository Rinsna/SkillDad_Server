/**
 * Manual Test Script for MonitoringService
 * 
 * This script tests the MonitoringService functionality manually.
 * Run with: node server/services/payment/test-monitoring-manual.js
 */

require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const MonitoringService = require('./MonitoringService');

async function testMonitoringService() {
  let dbConnected = false;
  
  try {
    console.log('=== MonitoringService Manual Test ===\n');

    // Try to connect to database (optional for basic tests)
    if (process.env.MONGO_URI) {
      console.log('Connecting to database...');
      await mongoose.connect(process.env.MONGO_URI);
      dbConnected = true;
      console.log('✓ Database connected\n');
    } else {
      console.log('⚠ MONGO_URI not set, skipping database-dependent tests\n');
    }

    // Test 1: Track payment attempts
    console.log('Test 1: Track Payment Attempts');
    MonitoringService.trackPaymentAttempt('TXN_TEST_001', 'success', {
      paymentMethod: 'credit_card'
    });
    MonitoringService.trackPaymentAttempt('TXN_TEST_002', 'failed', {
      paymentMethod: 'upi',
      errorCode: 'INSUFFICIENT_FUNDS',
      errorMessage: 'Insufficient balance',
      errorCategory: 'insufficient_funds'
    });
    MonitoringService.trackPaymentAttempt('TXN_TEST_003', 'success', {
      paymentMethod: 'net_banking'
    });
    console.log('✓ Payment attempts tracked\n');

    // Test 2: Track API response times
    console.log('Test 2: Track API Response Times');
    MonitoringService.trackAPIResponseTime('createPaymentRequest', 1200);
    MonitoringService.trackAPIResponseTime('queryTransactionStatus', 800);
    MonitoringService.trackAPIResponseTime('initiateRefund', 6500); // Should trigger alert
    console.log('✓ API response times tracked\n');

    // Test 3: Get payment metrics
    if (dbConnected) {
      console.log('Test 3: Get Payment Metrics');
      const metrics24h = await MonitoringService.getPaymentMetrics('24h');
      console.log('Metrics (24h):', JSON.stringify(metrics24h, null, 2));
      console.log('✓ Payment metrics retrieved\n');
    } else {
      console.log('Test 3: Get Payment Metrics - SKIPPED (no database)\n');
    }

    // Test 4: Check system health
    if (dbConnected) {
      console.log('Test 4: Check System Health');
      const health = await MonitoringService.checkSystemHealth();
      console.log('System Health:', JSON.stringify(health, null, 2));
      console.log('✓ System health checked\n');
    } else {
      console.log('Test 4: Check System Health - SKIPPED (no database)\n');
    }

    // Test 5: Get recent transactions
    if (dbConnected) {
      console.log('Test 5: Get Recent Transactions');
      const recentTransactions = await MonitoringService.getRecentTransactions(5);
      console.log(`Found ${recentTransactions.length} recent transactions`);
      if (recentTransactions.length > 0) {
        console.log('Sample transaction:', JSON.stringify(recentTransactions[0], null, 2));
      }
      console.log('✓ Recent transactions retrieved\n');
    } else {
      console.log('Test 5: Get Recent Transactions - SKIPPED (no database)\n');
    }

    // Test 6: Log API error
    console.log('Test 6: Log API Error');
    MonitoringService.logAPIError('createPaymentRequest', 'GATEWAY_TIMEOUT', 'Gateway did not respond within timeout period');
    console.log('✓ API error logged\n');

    // Test 7: Clear old metrics
    console.log('Test 7: Clear Old Metrics');
    MonitoringService.clearOldMetrics();
    console.log('✓ Old metrics cleared\n');

    console.log('=== All Tests Completed Successfully ===');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    if (dbConnected) {
      await mongoose.connection.close();
      console.log('\nDatabase connection closed');
    }
  }
}

// Run tests
testMonitoringService();
