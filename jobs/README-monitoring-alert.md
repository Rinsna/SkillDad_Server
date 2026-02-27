# Monitoring Alert Job

## Overview

The Monitoring Alert Job is a scheduled cron job that runs every 5 minutes to monitor the health of the HDFC SmartGateway payment system. It checks critical metrics and sends alerts to administrators when thresholds are breached.

## Features

- **Automated Monitoring**: Runs every 5 minutes to check system health
- **Success Rate Monitoring**: Alerts when payment success rate drops below 90%
- **API Response Time Monitoring**: Alerts when gateway API response time exceeds 5 seconds
- **Alert Cooldown**: Prevents alert spam with 30-minute cooldown between alerts
- **Admin Notifications**: Sends email alerts to all admin users when issues are detected

## Schedule

- **Frequency**: Every 5 minutes
- **Cron Expression**: `*/5 * * * *`
- **Timezone**: Asia/Kolkata (IST) by default

## Thresholds

### Success Rate
- **Threshold**: 90%
- **Alert Condition**: Success rate < 90%
- **Action**: Email alert sent to all admins

### API Response Time
- **Threshold**: 5000ms (5 seconds)
- **Alert Condition**: Average API response time > 5 seconds
- **Action**: Email alert sent to all admins

## Alert Cooldown

To prevent alert fatigue, the job implements a 30-minute cooldown period between alerts of the same type. This means:

- If a success rate alert is sent at 10:00 AM, the next success rate alert won't be sent until 10:30 AM (even if the condition persists)
- API response time alerts have their own independent cooldown
- This ensures admins are notified of issues without being overwhelmed by repeated alerts

## Usage

### Automatic Scheduling

The job is automatically scheduled when the application starts:

```javascript
const jobScheduler = require('./jobs');
jobScheduler.initializeJobs();
```

### Manual Execution

For testing or troubleshooting, you can run the job manually:

```javascript
const jobScheduler = require('./jobs');
await jobScheduler.runJobManually('monitoringAlert');
```

### Get Job Status

Check the current status of the monitoring alert job:

```javascript
const jobScheduler = require('./jobs');
const status = jobScheduler.getJobsStatus();
console.log(status.monitoringAlert);
```

Status includes:
- `isRunning`: Whether the job is currently executing
- `lastRunTime`: Timestamp of last execution
- `lastRunStatus`: 'success' or 'failed'
- `lastAlertStats`: Statistics from last run (checks performed, alerts sent)
- `lastAlerts`: Timestamps of last alerts sent for each type
- `alertCooldownMinutes`: Cooldown period in minutes (30)

## Testing

### Unit Tests

Run unit tests to verify job logic without database:

```bash
node server/jobs/test-monitoring-alert-unit.js
```

Tests include:
- Alert cooldown logic
- Job status tracking
- Method availability

### Integration Tests

Run integration tests with database (requires MongoDB connection):

```bash
node server/jobs/test-monitoring-alert-job.js
```

### Full Test with Sample Data

Run comprehensive test with simulated low success rate and slow API responses:

```bash
node server/jobs/test-monitoring-alert-with-data.js
```

This test:
1. Creates sample transactions with 20% success rate (below 90% threshold)
2. Simulates slow API response times (6 seconds, above 5s threshold)
3. Runs the monitoring job
4. Verifies alerts are triggered
5. Cleans up test data

## Alert Email Format

### Success Rate Alert

**Subject**: 🚨 ALERT: Payment Success Rate Below Threshold

**Content**:
- Current success rate
- Threshold value
- Timestamp
- Action items:
  - Check HDFC Gateway status
  - Review recent failed transactions
  - Check for system errors
  - Monitor the situation

### API Response Time Alert

**Subject**: 🚨 ALERT: Gateway API Response Time Exceeded

**Content**:
- Current response time
- Threshold value
- Timestamp
- Action items:
  - Check HDFC Gateway status and connectivity
  - Review network latency
  - Check for ongoing maintenance
  - Monitor API response times
  - Consider contacting HDFC support

## Requirements

This job fulfills the following requirements:

- **Requirement 16.4**: Alert Admin when payment success rate drops below 90%
- **Requirement 16.5**: Alert Admin when Payment_Gateway API response time exceeds 5 seconds

## Dependencies

- `node-cron`: For scheduling the job
- `MonitoringService`: For checking system health and metrics
- `User` model: For finding admin users to send alerts

## Configuration

### Environment Variables

- `TIMEZONE`: Timezone for cron scheduling (default: 'Asia/Kolkata')

### Customization

You can customize the job by modifying:

- **Alert thresholds**: Edit `MonitoringService.thresholds`
- **Cooldown period**: Edit `this.alertCooldown` in constructor (default: 30 minutes)
- **Schedule frequency**: Edit `cronExpression` in `schedule()` method (default: every 5 minutes)

## Monitoring

The job logs all activities to the console:

- Job start and completion
- System health status
- Alerts sent
- Errors encountered

Example log output:

```
[Monitoring Alert Job] Starting monitoring check at 2024-01-15T10:00:00.000Z
[Monitoring Alert Job] System health status: degraded
[Monitoring Alert Job] Success rate alert sent
[Monitoring Alert Job] Monitoring check completed: { checksPerformed: 1, alertsSent: 1, errors: 0 }
[Monitoring Alert Job] Job completed successfully in 2.34 seconds
```

## Troubleshooting

### Job Not Running

1. Check if job scheduler is initialized in your application
2. Verify MongoDB connection is established
3. Check console logs for initialization errors

### Alerts Not Sent

1. Verify admin users exist in the database with role 'admin'
2. Check if alert is in cooldown period (30 minutes)
3. Verify thresholds are actually breached
4. Check console logs for email sending errors

### False Alerts

1. Review threshold values - they may need adjustment
2. Check if there are actual system issues
3. Verify monitoring data is accurate

## Future Enhancements

Potential improvements for the monitoring alert job:

1. **Email Integration**: Implement actual email sending (currently logs to console)
2. **SMS Alerts**: Add SMS notifications for critical alerts
3. **Slack Integration**: Send alerts to Slack channels
4. **Alert Escalation**: Escalate to senior admins if issues persist
5. **Custom Thresholds**: Allow admins to configure thresholds via UI
6. **Alert History**: Store alert history in database for analysis
7. **Dashboard Integration**: Display real-time alerts in admin dashboard
8. **Multiple Alert Channels**: Support multiple notification channels (email, SMS, Slack)

## Related Files

- `server/jobs/monitoringAlertJob.js`: Main job implementation
- `server/jobs/index.js`: Job scheduler that initializes all jobs
- `server/services/payment/MonitoringService.js`: Service for checking system health
- `server/jobs/test-monitoring-alert-unit.js`: Unit tests
- `server/jobs/test-monitoring-alert-job.js`: Integration tests
- `server/jobs/test-monitoring-alert-with-data.js`: Full test with sample data
