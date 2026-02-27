const cron = require('node-cron');
const Transaction = require('../models/payment/Transaction');
const PaymentSession = require('../models/payment/PaymentSession');

/**
 * Session Cleanup Cron Job
 * 
 * Runs every hour to:
 * - Find expired payment sessions
 * - Update associated transactions to "failed" status with "expired" error category
 * - Clean up expired session records
 * 
 * Requirements: 1.7
 */

class SessionCleanupJob {
  constructor() {
    this.isRunning = false;
    this.lastRunTime = null;
    this.lastRunStatus = null;
    this.lastCleanupStats = null;
  }

  /**
   * Run the session cleanup job
   */
  async runCleanup() {
    if (this.isRunning) {
      console.log('[Session Cleanup Job] Job already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();
    
    console.log(`[Session Cleanup Job] Starting session cleanup at ${startTime.toISOString()}`);

    try {
      const stats = {
        expiredSessions: 0,
        updatedTransactions: 0,
        errors: 0
      };

      // Find all active sessions that have expired
      const expiredSessions = await PaymentSession.find({
        status: 'active',
        expiresAt: { $lt: new Date() }
      });

      console.log(`[Session Cleanup Job] Found ${expiredSessions.length} expired sessions`);

      // Process each expired session
      for (const session of expiredSessions) {
        try {
          // Mark session as expired
          await session.markExpired();
          stats.expiredSessions++;

          // Find associated transaction
          const transaction = await Transaction.findOne({
            transactionId: session.transactionId,
            status: 'pending' // Only update if still pending
          });

          if (transaction) {
            // Update transaction status to failed with expired error category
            transaction.status = 'failed';
            transaction.errorCategory = 'expired';
            transaction.errorMessage = 'Payment session expired';
            transaction.completedAt = new Date();
            
            await transaction.save();
            stats.updatedTransactions++;

            console.log(`[Session Cleanup Job] Updated transaction ${transaction.transactionId} to failed status (expired)`);
          }

        } catch (error) {
          console.error(`[Session Cleanup Job] Error processing session ${session.sessionId}:`, error.message);
          stats.errors++;
        }
      }

      // Store cleanup stats
      this.lastCleanupStats = stats;

      console.log(`[Session Cleanup Job] Cleanup completed:`, {
        expiredSessions: stats.expiredSessions,
        updatedTransactions: stats.updatedTransactions,
        errors: stats.errors
      });

      // Update job status
      this.lastRunTime = startTime;
      this.lastRunStatus = 'success';

      const endTime = new Date();
      const duration = (endTime - startTime) / 1000; // Duration in seconds
      
      console.log(`[Session Cleanup Job] Job completed successfully in ${duration.toFixed(2)} seconds`);

    } catch (error) {
      console.error('[Session Cleanup Job] Job failed:', error);
      
      // Update job status
      this.lastRunTime = startTime;
      this.lastRunStatus = 'failed';
      this.lastError = error.message;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Schedule the cron job
   * Runs every hour at the top of the hour (0 * * * *)
   */
  schedule() {
    console.log('[Session Cleanup Job] Scheduling session cleanup job to run every hour');

    // Schedule: Run at the top of every hour
    // Cron format: minute hour day month dayOfWeek
    // 0 * * * * = At minute 0 of every hour
    const cronExpression = '0 * * * *';

    const job = cron.schedule(cronExpression, async () => {
      await this.runCleanup();
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Kolkata', // Default to IST
    });

    console.log(`[Session Cleanup Job] Job scheduled successfully with expression: ${cronExpression}`);
    console.log(`[Session Cleanup Job] Timezone: ${process.env.TIMEZONE || 'Asia/Kolkata'}`);
    console.log('[Session Cleanup Job] Next run will be at the top of the next hour');

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
      lastCleanupStats: this.lastCleanupStats || null
    };
  }

  /**
   * Run job manually (for testing)
   */
  async runManually() {
    console.log('[Session Cleanup Job] Running job manually...');
    await this.runCleanup();
  }
}

module.exports = SessionCleanupJob;
