# Scheduled Jobs

This directory contains all scheduled cron jobs for the SkillDad platform.

## Daily Reconciliation Job

**File**: `dailyReconciliationJob.js`

**Schedule**: Daily at 2:00 AM (IST by default)

**Purpose**: Automatically reconciles payment transactions with HDFC Bank settlement reports.

### What it does:

1. **Fetches Previous Day's Transactions**: Retrieves all transactions from the previous day (00:00:00 to 23:59:59)
2. **Runs Reconciliation**: Compares local transaction records with HDFC settlement data
3. **Identifies Discrepancies**: Flags any mismatches in amounts, statuses, or missing transactions
4. **Sends Summary Email**: Emails a detailed reconciliation report to the finance team

### Configuration

Add the following environment variables to your `.env` file:

```env
# Finance Team Emails (comma-separated)
FINANCE_TEAM_EMAILS=finance@skilldad.com,accounts@skilldad.com

# Timezone for scheduled jobs (default: Asia/Kolkata)
TIMEZONE=Asia/Kolkata
```

### Requirements

This job implements the following requirements:
- **Requirement 10.2**: Fetch settlement reports from Payment Gateway daily
- **Requirement 10.10**: Send automated reconciliation summary emails to Finance Team daily

### Testing

To test the reconciliation job manually without waiting for the scheduled time:

```bash
node jobs/test-reconciliation-job.js
```

This will:
- Connect to the database
- Initialize all required services
- Run the reconciliation for the previous day
- Send the summary email to the configured finance team
- Display the job status

### Monitoring

The job logs all activities to the console with the prefix `[Reconciliation Job]`.

**Success logs**:
```
[Reconciliation Job] Starting daily reconciliation at 2024-01-15T02:00:00.000Z
[Reconciliation Job] Reconciling transactions from 2024-01-14T00:00:00.000Z to 2024-01-14T23:59:59.999Z
[Reconciliation Job] Reconciliation completed: { reconciliationId: ..., totalTransactions: 150, ... }
[Reconciliation Job] Sending summary email to: finance@skilldad.com, accounts@skilldad.com
[Reconciliation Job] Summary email sent successfully
[Reconciliation Job] Job completed successfully in 12.34 seconds
```

**Error logs**:
```
[Reconciliation Job] Job failed: Error message here
```

### Job Status

You can check the job status programmatically:

```javascript
const jobScheduler = require('./jobs');
const status = jobScheduler.getJobsStatus();
console.log(status.dailyReconciliation);
```

Returns:
```javascript
{
  isRunning: false,
  lastRunTime: '2024-01-15T02:00:00.000Z',
  lastRunStatus: 'success',
  lastError: null
}
```

### Manual Execution

To run the job manually (useful for testing or catching up):

```javascript
const jobScheduler = require('./jobs');
await jobScheduler.runJobManually('dailyReconciliation');
```

### Cron Expression

The job uses the following cron expression:

```
0 2 * * *
```

This means:
- **Minute**: 0 (at the start of the hour)
- **Hour**: 2 (2 AM)
- **Day of Month**: * (every day)
- **Month**: * (every month)
- **Day of Week**: * (every day of the week)

### Error Handling

The job includes comprehensive error handling:

1. **Service Initialization Errors**: Logged and thrown to prevent job scheduling
2. **Reconciliation Errors**: Logged with full error details, job status updated to 'failed'
3. **Email Errors**: Logged but don't fail the entire job
4. **Concurrent Execution Prevention**: Job won't run if already in progress

### Dependencies

- `node-cron`: Cron job scheduler
- `ReconciliationService`: Handles reconciliation logic
- `EmailService`: Sends summary emails
- `HDFCGatewayService`: Communicates with HDFC Bank API

## Job Scheduler

**File**: `index.js`

The job scheduler manages all scheduled jobs in the application.

### Features:

- **Centralized Management**: All jobs are initialized and managed from one place
- **Status Monitoring**: Get status of all jobs
- **Manual Execution**: Run any job manually for testing
- **Graceful Shutdown**: Stop all jobs cleanly

### Usage:

The job scheduler is automatically initialized when the server starts (in `server.js`):

```javascript
const jobScheduler = require('./jobs');
jobScheduler.initializeJobs();
```

## Adding New Jobs

To add a new scheduled job:

1. Create a new job class in this directory (e.g., `myNewJob.js`)
2. Implement the required methods:
   - `schedule()`: Set up the cron schedule
   - `runManually()`: Allow manual execution
   - `getStatus()`: Return job status
3. Register the job in `index.js`:

```javascript
const MyNewJob = require('./myNewJob');

// In initializeJobs():
const myNewJob = new MyNewJob();
const scheduledJob = myNewJob.schedule();

this.jobs.myNewJob = {
  instance: myNewJob,
  cronJob: scheduledJob,
};
```

## Production Considerations

1. **Timezone**: Ensure `TIMEZONE` environment variable is set correctly for your deployment region
2. **Email Configuration**: Verify finance team emails are correct in production
3. **Monitoring**: Set up alerts for job failures
4. **Logging**: Consider using a logging service to track job execution
5. **Database Connection**: Ensure database is available when jobs run
6. **Resource Usage**: Monitor server resources during job execution

## Troubleshooting

### Job not running

1. Check server logs for initialization errors
2. Verify cron expression is correct
3. Ensure timezone is set properly
4. Check if job is scheduled: `jobScheduler.getJobsStatus()`

### Email not sent

1. Verify `FINANCE_TEAM_EMAILS` is set in `.env`
2. Check email service configuration
3. Review email service logs
4. Test email service manually

### Reconciliation errors

1. Check HDFC Gateway credentials
2. Verify network connectivity to HDFC API
3. Review transaction data in database
4. Check settlement report format

## Support

For issues or questions about scheduled jobs, contact the development team or refer to the main project documentation.
