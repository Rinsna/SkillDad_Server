const cron = require('node-cron');
const ReconciliationService = require('../services/payment/ReconciliationService');
const EmailService = require('../services/payment/EmailService');

/**
 * Daily Reconciliation Cron Job
 * 
 * Runs daily at 2 AM to:
 * - Fetch previous day's transactions
 * - Run reconciliation automatically
 * - Send summary email to finance team
 */

class DailyReconciliationJob {
  constructor() {
    this.reconciliationService = null;
    this.emailService = null;
    this.isRunning = false;
    this.lastRunTime = null;
    this.lastRunStatus = null;
  }

  /**
   * Initialize services
   */
  initializeServices() {
    try {
      // Initialize services
      this.reconciliationService = new ReconciliationService();
      this.emailService = new EmailService();

      console.log('[Reconciliation Job] Services initialized successfully');
    } catch (error) {
      console.error('[Reconciliation Job] Failed to initialize services:', error.message);
      throw error;
    }
  }

  /**
   * Get previous day's date range
   * @returns {Object} Start and end dates for previous day
   */
  getPreviousDayRange() {
    const now = new Date();

    // Set to previous day
    const previousDay = new Date(now);
    previousDay.setDate(previousDay.getDate() - 1);

    // Start of previous day (00:00:00)
    const startDate = new Date(previousDay);
    startDate.setHours(0, 0, 0, 0);

    // End of previous day (23:59:59)
    const endDate = new Date(previousDay);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  /**
   * Get finance team email addresses from environment
   * @returns {Array} Array of finance team email addresses
   */
  getFinanceEmails() {
    const financeEmailsEnv = process.env.FINANCE_TEAM_EMAILS || '';

    if (!financeEmailsEnv) {
      console.warn('[Reconciliation Job] No finance team emails configured');
      return [];
    }

    // Split by comma and trim whitespace
    return financeEmailsEnv.split(',').map(email => email.trim()).filter(email => email);
  }

  /**
   * Run the reconciliation job
   */
  async runReconciliation() {
    if (this.isRunning) {
      console.log('[Reconciliation Job] Job already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();

    console.log(`[Reconciliation Job] Starting daily reconciliation at ${startTime.toISOString()}`);

    try {
      // Initialize services if not already done
      if (!this.reconciliationService || !this.emailService) {
        this.initializeServices();
      }

      // Get previous day's date range
      const { startDate, endDate } = this.getPreviousDayRange();

      console.log(`[Reconciliation Job] Reconciling transactions from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Run reconciliation
      const reconciliation = await this.reconciliationService.reconcileTransactions(
        startDate,
        endDate,
        'system' // System user ID for automated jobs
      );

      console.log(`[Reconciliation Job] Reconciliation completed:`, {
        reconciliationId: reconciliation._id,
        totalTransactions: reconciliation.totalTransactions,
        matchedTransactions: reconciliation.matchedTransactions,
        unmatchedTransactions: reconciliation.unmatchedTransactions,
        discrepanciesCount: reconciliation.discrepancies.length,
      });

      // Get finance team emails
      const financeEmails = this.getFinanceEmails();

      if (financeEmails.length === 0) {
        console.warn('[Reconciliation Job] No finance team emails configured, skipping email notification');
      } else {
        // Send summary email to finance team
        console.log(`[Reconciliation Job] Sending summary email to: ${financeEmails.join(', ')}`);

        await this.emailService.sendReconciliationSummary(
          reconciliation,
          financeEmails
        );

        console.log('[Reconciliation Job] Summary email sent successfully');
      }

      // Update job status
      this.lastRunTime = startTime;
      this.lastRunStatus = 'success';

      const endTime = new Date();
      const duration = (endTime - startTime) / 1000; // Duration in seconds

      console.log(`[Reconciliation Job] Job completed successfully in ${duration.toFixed(2)} seconds`);

    } catch (error) {
      console.error('[Reconciliation Job] Job failed:', error);

      // Update job status
      this.lastRunTime = startTime;
      this.lastRunStatus = 'failed';
      this.lastError = error.message;

      // Try to send error notification to finance team
      try {
        const financeEmails = this.getFinanceEmails();
        if (financeEmails.length > 0) {
          // Send error notification (you may want to create a specific error email template)
          console.log('[Reconciliation Job] Sending error notification to finance team');
          // For now, just log the error
        }
      } catch (emailError) {
        console.error('[Reconciliation Job] Failed to send error notification:', emailError);
      }

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Schedule the cron job
   * Runs daily at 2 AM (0 2 * * *)
   */
  schedule() {
    console.log('[Reconciliation Job] Scheduling daily reconciliation job for 2:00 AM');

    // Schedule: Run at 2:00 AM every day
    // Cron format: minute hour day month dayOfWeek
    // 0 2 * * * = At 02:00 every day
    const cronExpression = '0 2 * * *';

    const job = cron.schedule(cronExpression, async () => {
      await this.runReconciliation();
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Kolkata', // Default to IST
    });

    console.log(`[Reconciliation Job] Job scheduled successfully with expression: ${cronExpression}`);
    console.log(`[Reconciliation Job] Timezone: ${process.env.TIMEZONE || 'Asia/Kolkata'}`);
    console.log('[Reconciliation Job] Next run will be at 2:00 AM');

    return job;
  }

  /**
   * Get job status
   * @returns {Object} Job status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      lastRunStatus: this.lastRunStatus,
      lastError: this.lastError || null,
    };
  }

  /**
   * Run job manually (for testing)
   */
  async runManually() {
    console.log('[Reconciliation Job] Running job manually...');
    await this.runReconciliation();
  }
}

module.exports = DailyReconciliationJob;
