const cron = require('node-cron');
const MonitoringService = require('../services/payment/MonitoringService');
const User = require('../models/userModel');

/**
 * Monitoring Alert Cron Job
 * 
 * Runs every 5 minutes to:
 * - Check payment success rate threshold (< 90%)
 * - Check gateway API response time threshold (> 5 seconds)
 * - Send alerts to admin when thresholds breached
 */

class MonitoringAlertJob {
  constructor() {
    this.isRunning = false;
    this.lastRunTime = null;
    this.lastRunStatus = null;
    this.lastAlertStats = null;
    this.alertCooldown = 30 * 60 * 1000; // 30 minutes cooldown between alerts
    this.lastAlerts = {
      successRate: null,
      apiResponseTime: null
    };
  }

  /**
   * Run the monitoring alert job
   */
  async runMonitoring() {
    if (this.isRunning) {
      console.log('[Monitoring Alert Job] Job already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();

    console.log(`[Monitoring Alert Job] Starting monitoring check at ${startTime.toISOString()}`);

    try {
      const stats = {
        checksPerformed: 0,
        alertsSent: 0,
        errors: 0
      };

      // Check system health
      const health = await MonitoringService.checkSystemHealth();
      stats.checksPerformed++;

      console.log(`[Monitoring Alert Job] System health status: ${health.status}`);

      // Check success rate threshold
      if (health.checks.successRate && health.checks.successRate.status === 'fail') {
        const shouldAlert = this.shouldSendAlert('successRate');

        if (shouldAlert) {
          await this.sendSuccessRateAlert(health.checks.successRate);
          this.lastAlerts.successRate = new Date();
          stats.alertsSent++;
          console.log('[Monitoring Alert Job] Success rate alert sent');
        } else {
          console.log('[Monitoring Alert Job] Success rate alert skipped (cooldown period)');
        }
      }

      // Check API response time threshold
      if (health.checks.apiResponseTime && health.checks.apiResponseTime.status === 'fail') {
        const shouldAlert = this.shouldSendAlert('apiResponseTime');

        if (shouldAlert) {
          await this.sendApiResponseTimeAlert(health.checks.apiResponseTime);
          this.lastAlerts.apiResponseTime = new Date();
          stats.alertsSent++;
          console.log('[Monitoring Alert Job] API response time alert sent');
        } else {
          console.log('[Monitoring Alert Job] API response time alert skipped (cooldown period)');
        }
      }

      // Store alert stats
      this.lastAlertStats = stats;

      console.log(`[Monitoring Alert Job] Monitoring check completed:`, {
        checksPerformed: stats.checksPerformed,
        alertsSent: stats.alertsSent,
        errors: stats.errors
      });

      // Update job status
      this.lastRunTime = startTime;
      this.lastRunStatus = 'success';

      const endTime = new Date();
      const duration = (endTime - startTime) / 1000; // Duration in seconds

      console.log(`[Monitoring Alert Job] Job completed successfully in ${duration.toFixed(2)} seconds`);

    } catch (error) {
      console.error('[Monitoring Alert Job] Job failed:', error);

      // Update job status
      this.lastRunTime = startTime;
      this.lastRunStatus = 'failed';
      this.lastError = error.message;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if alert should be sent (respects cooldown period)
   * @param {string} alertType - Type of alert (successRate, apiResponseTime)
   * @returns {boolean} Whether alert should be sent
   */
  shouldSendAlert(alertType) {
    const lastAlert = this.lastAlerts[alertType];

    if (!lastAlert) {
      return true; // No previous alert, send it
    }

    const timeSinceLastAlert = Date.now() - lastAlert.getTime();
    return timeSinceLastAlert >= this.alertCooldown;
  }

  /**
   * Send success rate alert to admins
   * @param {Object} checkResult - Success rate check result
   */
  async sendSuccessRateAlert(checkResult) {
    try {
      // Find all admin users
      const admins = await User.find({ role: 'admin' }).select('email name');

      if (admins.length === 0) {
        console.warn('[Monitoring Alert Job] No admin users found to send alert');
        return;
      }

      const adminEmails = admins.map(admin => admin.email);

      // Prepare alert email content
      const subject = '🚨 ALERT: Payment Success Rate Below Threshold';
      const message = `
        <h2>Payment System Alert</h2>
        <p><strong>Alert Type:</strong> Low Payment Success Rate</p>
        <p><strong>Current Success Rate:</strong> ${checkResult.value}%</p>
        <p><strong>Threshold:</strong> ${checkResult.threshold}%</p>
        <p><strong>Status:</strong> ${checkResult.message}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        
        <h3>Action Required</h3>
        <p>The payment success rate has dropped below the acceptable threshold. Please investigate immediately:</p>
        <ul>
          <li>Check Payment Gateway status</li>
          <li>Review recent failed transactions</li>
          <li>Check for any system errors or issues</li>
          <li>Monitor the situation closely</li>
        </ul>
        
        <p>This is an automated alert from the SkillDad Payment Monitoring System.</p>
      `;

      // Send email to all admins
      console.log(`[Monitoring Alert Job] Sending success rate alert to ${adminEmails.length} admin(s)`);

      // In production, use EmailService to send actual emails
      // For now, just log the alert
      console.log('[Monitoring Alert Job] Alert Email:', {
        to: adminEmails,
        subject,
        message: checkResult.message
      });

      // TODO: Uncomment when EmailService supports generic email sending
      // const EmailService = require('../services/payment/EmailService');
      // await EmailService.sendGenericEmail(adminEmails, subject, message);

    } catch (error) {
      console.error('[Monitoring Alert Job] Error sending success rate alert:', error);
      throw error;
    }
  }

  /**
   * Send API response time alert to admins
   * @param {Object} checkResult - API response time check result
   */
  async sendApiResponseTimeAlert(checkResult) {
    try {
      // Find all admin users
      const admins = await User.find({ role: 'admin' }).select('email name');

      if (admins.length === 0) {
        console.warn('[Monitoring Alert Job] No admin users found to send alert');
        return;
      }

      const adminEmails = admins.map(admin => admin.email);

      // Prepare alert email content
      const subject = '🚨 ALERT: Gateway API Response Time Exceeded';
      const message = `
        <h2>Payment System Alert</h2>
        <p><strong>Alert Type:</strong> High API Response Time</p>
        <p><strong>Current Response Time:</strong> ${checkResult.value}ms (${(checkResult.value / 1000).toFixed(2)}s)</p>
        <p><strong>Threshold:</strong> ${checkResult.threshold}ms (${(checkResult.threshold / 1000).toFixed(2)}s)</p>
        <p><strong>Status:</strong> ${checkResult.message}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        
        <h3>Action Required</h3>
        <p>The HDFC Gateway API response time has exceeded the acceptable threshold. Please investigate immediately:</p>
        <ul>
          <li>Check Payment Gateway status and connectivity</li>
          <li>Review network latency and bandwidth</li>
          <li>Check for any ongoing maintenance or issues</li>
          <li>Monitor API response times closely</li>
          <li>Consider contacting Gateway support if issue persists</li>
        </ul>
        
        <p>This is an automated alert from the SkillDad Payment Monitoring System.</p>
      `;

      // Send email to all admins
      console.log(`[Monitoring Alert Job] Sending API response time alert to ${adminEmails.length} admin(s)`);

      // In production, use EmailService to send actual emails
      // For now, just log the alert
      console.log('[Monitoring Alert Job] Alert Email:', {
        to: adminEmails,
        subject,
        message: checkResult.message
      });

      // TODO: Uncomment when EmailService supports generic email sending
      // const EmailService = require('../services/payment/EmailService');
      // await EmailService.sendGenericEmail(adminEmails, subject, message);

    } catch (error) {
      console.error('[Monitoring Alert Job] Error sending API response time alert:', error);
      throw error;
    }
  }

  /**
   * Schedule the cron job
   * Runs every 5 minutes
   */
  schedule() {
    console.log('[Monitoring Alert Job] Scheduling monitoring alert job to run every 5 minutes');

    // Schedule: Run every 5 minutes
    // Cron format: minute hour day month dayOfWeek
    // */5 * * * * = Every 5 minutes
    const cronExpression = '*/5 * * * *';

    const job = cron.schedule(cronExpression, async () => {
      await this.runMonitoring();
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Kolkata', // Default to IST
    });

    console.log(`[Monitoring Alert Job] Job scheduled successfully with expression: ${cronExpression}`);
    console.log(`[Monitoring Alert Job] Timezone: ${process.env.TIMEZONE || 'Asia/Kolkata'}`);
    console.log('[Monitoring Alert Job] Next run will be in 5 minutes');
    console.log(`[Monitoring Alert Job] Alert cooldown period: ${this.alertCooldown / 60000} minutes`);

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
      lastAlertStats: this.lastAlertStats || null,
      lastAlerts: {
        successRate: this.lastAlerts.successRate,
        apiResponseTime: this.lastAlerts.apiResponseTime
      },
      alertCooldownMinutes: this.alertCooldown / 60000
    };
  }

  /**
   * Run job manually (for testing)
   */
  async runManually() {
    console.log('[Monitoring Alert Job] Running job manually...');
    await this.runMonitoring();
  }
}

module.exports = MonitoringAlertJob;
