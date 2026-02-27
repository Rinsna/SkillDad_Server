const DailyReconciliationJob = require('./dailyReconciliationJob');
const SessionCleanupJob = require('./sessionCleanupJob');
const MonitoringAlertJob = require('./monitoringAlertJob');

/**
 * Job Scheduler
 * 
 * Initializes and manages all scheduled jobs
 */

class JobScheduler {
  constructor() {
    this.jobs = {};
  }

  /**
   * Initialize all jobs
   */
  initializeJobs() {
    console.log('[Job Scheduler] Initializing scheduled jobs...');

    try {
      // Initialize Daily Reconciliation Job
      const reconciliationJob = new DailyReconciliationJob();
      const scheduledReconciliationJob = reconciliationJob.schedule();
      
      this.jobs.dailyReconciliation = {
        instance: reconciliationJob,
        cronJob: scheduledReconciliationJob,
      };

      // Initialize Session Cleanup Job
      const sessionCleanupJob = new SessionCleanupJob();
      const scheduledCleanupJob = sessionCleanupJob.schedule();
      
      this.jobs.sessionCleanup = {
        instance: sessionCleanupJob,
        cronJob: scheduledCleanupJob,
      };

      // Initialize Monitoring Alert Job
      const monitoringAlertJob = new MonitoringAlertJob();
      const scheduledMonitoringJob = monitoringAlertJob.schedule();
      
      this.jobs.monitoringAlert = {
        instance: monitoringAlertJob,
        cronJob: scheduledMonitoringJob,
      };

      console.log('[Job Scheduler] All jobs initialized successfully');
      console.log('[Job Scheduler] Active jobs:', Object.keys(this.jobs));

    } catch (error) {
      console.error('[Job Scheduler] Failed to initialize jobs:', error);
      throw error;
    }
  }

  /**
   * Get status of all jobs
   * @returns {Object} Status of all jobs
   */
  getJobsStatus() {
    const status = {};
    
    for (const [jobName, job] of Object.entries(this.jobs)) {
      status[jobName] = job.instance.getStatus();
    }
    
    return status;
  }

  /**
   * Run a job manually
   * @param {string} jobName - Name of the job to run
   */
  async runJobManually(jobName) {
    if (!this.jobs[jobName]) {
      throw new Error(`Job '${jobName}' not found`);
    }

    console.log(`[Job Scheduler] Running job '${jobName}' manually...`);
    await this.jobs[jobName].instance.runManually();
  }

  /**
   * Stop all jobs
   */
  stopAllJobs() {
    console.log('[Job Scheduler] Stopping all jobs...');
    
    for (const [jobName, job] of Object.entries(this.jobs)) {
      if (job.cronJob) {
        job.cronJob.stop();
        console.log(`[Job Scheduler] Stopped job: ${jobName}`);
      }
    }
  }
}

// Create singleton instance
const jobScheduler = new JobScheduler();

module.exports = jobScheduler;
