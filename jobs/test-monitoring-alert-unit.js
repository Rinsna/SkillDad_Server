const MonitoringAlertJob = require('./monitoringAlertJob');

/**
 * Unit test for Monitoring Alert Job
 * 
 * Tests the job logic without database dependencies
 */

function testAlertCooldown() {
  console.log('\n1. Testing alert cooldown logic...');
  
  const job = new MonitoringAlertJob();
  
  // First alert should be sent
  const shouldSend1 = job.shouldSendAlert('successRate');
  console.log(`   First alert (no previous): ${shouldSend1 ? '✓ PASS' : '✗ FAIL'}`);
  
  // Simulate sending alert
  job.lastAlerts.successRate = new Date();
  
  // Second alert immediately should NOT be sent (cooldown)
  const shouldSend2 = job.shouldSendAlert('successRate');
  console.log(`   Second alert (immediate): ${!shouldSend2 ? '✓ PASS' : '✗ FAIL'}`);
  
  // Simulate time passing (31 minutes)
  job.lastAlerts.successRate = new Date(Date.now() - 31 * 60 * 1000);
  
  // Third alert after cooldown should be sent
  const shouldSend3 = job.shouldSendAlert('successRate');
  console.log(`   Third alert (after cooldown): ${shouldSend3 ? '✓ PASS' : '✗ FAIL'}`);
  
  return shouldSend1 && !shouldSend2 && shouldSend3;
}

function testJobStatus() {
  console.log('\n2. Testing job status tracking...');
  
  const job = new MonitoringAlertJob();
  
  // Initial status
  const status1 = job.getStatus();
  console.log(`   Initial status: ${status1.isRunning === false ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`   Last run time: ${status1.lastRunTime === null ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`   Alert cooldown: ${status1.alertCooldownMinutes === 30 ? '✓ PASS' : '✗ FAIL'}`);
  
  return !status1.isRunning && status1.lastRunTime === null && status1.alertCooldownMinutes === 30;
}

function testCronExpression() {
  console.log('\n3. Testing cron schedule configuration...');
  
  const job = new MonitoringAlertJob();
  
  // The schedule method should return a cron job
  // We won't actually schedule it, just verify the method exists
  console.log(`   Schedule method exists: ${typeof job.schedule === 'function' ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`   Run manually method exists: ${typeof job.runManually === 'function' ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`   Get status method exists: ${typeof job.getStatus === 'function' ? '✓ PASS' : '✗ FAIL'}`);
  
  return typeof job.schedule === 'function' && 
         typeof job.runManually === 'function' && 
         typeof job.getStatus === 'function';
}

function runAllTests() {
  console.log('='.repeat(60));
  console.log('Monitoring Alert Job - Unit Tests');
  console.log('='.repeat(60));
  
  const results = [];
  
  try {
    results.push(testAlertCooldown());
    results.push(testJobStatus());
    results.push(testCronExpression());
    
    const allPassed = results.every(r => r === true);
    
    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('✓ All tests PASSED');
    } else {
      console.log('✗ Some tests FAILED');
    }
    console.log('='.repeat(60));
    
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run all tests
runAllTests();
