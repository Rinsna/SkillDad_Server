# MonitoringService Usage Guide

## Overview

The MonitoringService tracks payment system health and performance metrics for the HDFC SmartGateway integration. It provides real-time monitoring, alerting, and analytics capabilities.

## Requirements Covered

- **16.1**: Track payment success rate
- **16.2**: Track average payment processing time
- **16.3**: Track Payment_Gateway API response times
- **16.4**: Alert when payment success rate drops below 90%
- **16.5**: Alert when API response time exceeds 5 seconds
- **16.6**: Provide dashboard metrics for 24h, 7d, and 30d
- **16.7**: Track most common payment failure reasons
- **16.8**: Track payment method usage distribution
- **16.9**: Log all Payment_Gateway API errors
- **16.10**: Provide real-time transaction monitoring

## Usage

### Import the Service

```javascript
const MonitoringService = require('./services/payment/MonitoringService');
```

### Track Payment Attempts

Track every payment attempt with status and metadata:

```javascript
MonitoringService.trackPaymentAttempt('TXN_123456', 'success', {
  paymentMethod: 'credit_card'
});

MonitoringService.trackPaymentAttempt('TXN_123457', 'failed', {
  paymentMethod: 'upi',
  errorCode: 'INSUFFICIENT_FUNDS',
  errorMessage: 'Insufficient balance',
  errorCategory: 'insufficient_funds'
});
```

### Track API Response Times

Track response times for HDFC Gateway API calls:

```javascript
const startTime = Date.now();
// ... make API call ...
const duration = Date.now() - startTime;

MonitoringService.trackAPIResponseTime('createPaymentRequest', duration);
```

### Get Payment Metrics

Retrieve metrics for different time ranges:

```javascript
// Get metrics for last 24 hours
const metrics24h = await MonitoringService.getPaymentMetrics('24h');

// Get metrics for last 7 days
const metrics7d = await MonitoringService.getPaymentMetrics('7d');

// Get metrics for last 30 days
const metrics30d = await MonitoringService.getPaymentMetrics('30d');

console.log('Success Rate:', metrics24h.successRate + '%');
console.log('Avg Processing Time:', metrics24h.avgProcessingTime + 's');
console.log('Failure Distribution:', metrics24h.failureDistribution);
console.log('Payment Method Distribution:', metrics24h.paymentMethodDistribution);
```

### Check System Health

Check overall system health and get alerts:

```javascript
const health = await MonitoringService.checkSystemHealth();

console.log('System Status:', health.status); // 'healthy', 'degraded', or 'unhealthy'
console.log('Database:', health.checks.database.status);
console.log('Success Rate:', health.checks.successRate.status);
console.log('API Response Time:', health.checks.apiResponseTime.status);
console.log('Gateway:', health.checks.gateway.status);

// Check for alerts
if (health.status === 'degraded') {
  console.warn('System is degraded!');
  Object.values(health.checks).forEach(check => {
    if (check.status === 'fail') {
      console.warn('Alert:', check.message);
    }
  });
}
```

### Get Recent Transactions

Retrieve recent transactions for real-time monitoring:

```javascript
const recentTransactions = await MonitoringService.getRecentTransactions(50);

recentTransactions.forEach(txn => {
  console.log(`${txn.transactionId}: ${txn.status} - ${txn.amount}`);
});
```

### Log API Errors

Log errors from HDFC Gateway API:

```javascript
MonitoringService.logAPIError(
  'createPaymentRequest',
  'GATEWAY_TIMEOUT',
  'Gateway did not respond within timeout period'
);
```

### Clear Old Metrics

Periodically clear old metrics from memory (recommended to run daily):

```javascript
MonitoringService.clearOldMetrics();
```

## Integration Examples

### In Payment Controller

```javascript
const MonitoringService = require('../services/payment/MonitoringService');

async function initiatePayment(req, res) {
  const startTime = Date.now();
  
  try {
    // Create payment request
    const result = await HDFCGatewayService.createPaymentRequest(data);
    
    // Track API response time
    const duration = Date.now() - startTime;
    MonitoringService.trackAPIResponseTime('createPaymentRequest', duration);
    
    // Track payment attempt
    MonitoringService.trackPaymentAttempt(transactionId, 'pending', {
      paymentMethod: 'unknown'
    });
    
    res.json(result);
  } catch (error) {
    // Log API error
    MonitoringService.logAPIError('createPaymentRequest', error.code, error.message);
    
    // Track failed attempt
    MonitoringService.trackPaymentAttempt(transactionId, 'failed', {
      errorCode: error.code,
      errorMessage: error.message,
      errorCategory: 'gateway'
    });
    
    res.status(500).json({ error: error.message });
  }
}
```

### In Webhook Handler

```javascript
async function handleWebhook(req, res) {
  const { transactionId, status, paymentMethod } = req.body;
  
  // Track payment attempt
  MonitoringService.trackPaymentAttempt(transactionId, status, {
    paymentMethod
  });
  
  // Update transaction in database
  await Transaction.findOneAndUpdate(
    { transactionId },
    { status, paymentMethod }
  );
  
  res.status(200).json({ success: true });
}
```

### In Admin Dashboard

```javascript
// Get metrics for dashboard
router.get('/api/admin/monitoring/metrics', async (req, res) => {
  const { timeRange = '24h' } = req.query;
  
  const metrics = await MonitoringService.getPaymentMetrics(timeRange);
  const health = await MonitoringService.checkSystemHealth();
  const recentTransactions = await MonitoringService.getRecentTransactions(50);
  
  res.json({
    metrics,
    health,
    recentTransactions
  });
});
```

## Metrics Response Format

### getPaymentMetrics()

```javascript
{
  timeRange: '24h',
  startDate: '2024-01-15T00:00:00.000Z',
  endDate: '2024-01-16T00:00:00.000Z',
  totalAttempts: 150,
  successfulPayments: 142,
  failedPayments: 8,
  successRate: 94.67,
  avgProcessingTime: 3.45, // seconds
  failureDistribution: {
    insufficient_funds: 3,
    card_declined: 2,
    network: 2,
    other: 1
  },
  failureReasons: [
    { category: 'insufficient_funds', count: 3, percentage: 2.0 },
    { category: 'card_declined', count: 2, percentage: 1.33 },
    { category: 'network', count: 2, percentage: 1.33 }
  ],
  paymentMethodDistribution: {
    credit_card: 80,
    debit_card: 40,
    upi: 20,
    net_banking: 10
  }
}
```

### checkSystemHealth()

```javascript
{
  status: 'healthy', // or 'degraded' or 'unhealthy'
  timestamp: '2024-01-16T10:30:00.000Z',
  checks: {
    database: {
      status: 'pass',
      message: 'Database is connected and responsive'
    },
    successRate: {
      status: 'pass',
      value: 94.67,
      threshold: 90,
      message: 'Success rate is within acceptable range'
    },
    apiResponseTime: {
      status: 'pass',
      value: 1234.56,
      threshold: 5000,
      message: 'API response time is within acceptable range'
    },
    gateway: {
      status: 'pass',
      message: 'Gateway is connected and responsive'
    }
  }
}
```

## Alert Thresholds

The service monitors the following thresholds:

- **Success Rate**: Alerts if below 90%
- **API Response Time**: Alerts if exceeds 5000ms (5 seconds)

Alerts are logged to console and included in health check results.

## Best Practices

1. **Track all payment attempts**: Call `trackPaymentAttempt()` for every payment, regardless of status
2. **Track API calls**: Measure and track response times for all HDFC Gateway API calls
3. **Log errors**: Use `logAPIError()` for all API errors to maintain audit trail
4. **Regular health checks**: Call `checkSystemHealth()` periodically (every 5 minutes recommended)
5. **Clear old metrics**: Run `clearOldMetrics()` daily to prevent memory issues
6. **Monitor alerts**: Set up automated alerts based on health check results

## Testing

Run the manual test script:

```bash
node server/services/payment/test-monitoring-manual.js
```

This will test all MonitoringService methods and verify functionality.

## Production Considerations

For production deployment:

1. **Persist metrics**: Store metrics in Redis or a time-series database instead of in-memory
2. **Alert notifications**: Integrate with email/SMS/Slack for real-time alerts
3. **Dashboard**: Create admin dashboard to visualize metrics
4. **Scheduled jobs**: Set up cron jobs for periodic health checks and metric cleanup
5. **Logging**: Integrate with centralized logging service (e.g., ELK stack, CloudWatch)
6. **Monitoring**: Use APM tools (e.g., New Relic, DataDog) for advanced monitoring

## Notes

- The service is exported as a singleton instance
- Metrics are stored in memory by default (suitable for development/testing)
- Database queries are used for accurate historical metrics
- In-memory metrics are used for real-time API response time tracking
