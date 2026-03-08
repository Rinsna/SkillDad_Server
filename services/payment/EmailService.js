const fs = require('fs').promises;
const path = require('path');
const sendEmail = require('../../utils/sendEmail');

/**
 * EmailService - Handles sending payment-related emails using templates
 * 
 * This service manages all email communications for the payment system including:
 * - Payment confirmation emails with receipt attachments
 * - Payment failure notifications
 * - Refund confirmation emails
 * - Reconciliation summary reports for finance team
 * 
 * Templates are located in server/templates/emails/ and use Handlebars syntax
 * 
 * Requirements: 3.9, 7.7, 8.8, 9.7, 10.10
 */
class EmailService {
  constructor() {
    this.templatesDir = path.join(__dirname, '../../templates/emails');
    this.companyInfo = {
      companyGSTIN: process.env.COMPANY_GSTIN || '29ABCDE1234F1Z5',
      companyAddress: process.env.COMPANY_ADDRESS || 'SkillDad Learning Pvt Ltd, Bangalore, India',
      websiteUrl: process.env.WEBSITE_URL || 'https://skilldad.com',
      supportUrl: process.env.SUPPORT_URL || 'https://skilldad.com/support',
      termsUrl: process.env.TERMS_URL || 'https://skilldad.com/terms',
      privacyUrl: process.env.PRIVACY_URL || 'https://skilldad.com/privacy',
    };
  }

  /**
   * Load and compile an email template
   * @param {string} templateName - Name of the template file (without .html extension)
   * @returns {Promise<string>} Template content
   */
  async loadTemplate(templateName) {
    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.html`);
      const template = await fs.readFile(templatePath, 'utf-8');
      return template;
    } catch (error) {
      console.error(`Error loading email template ${templateName}:`, error);
      throw new Error(`Failed to load email template: ${templateName}`);
    }
  }

  /**
   * Simple template rendering function (replaces Handlebars variables)
   * Supports {{variable}}, {{#if variable}}...{{/if}}, and {{#each array}}...{{/each}}
   * @param {string} template - Template string
   * @param {Object} data - Data to render
   * @returns {string} Rendered template
   */
  renderTemplate(template, data) {
    let rendered = template;

    // Handle {{#if variable}} blocks
    rendered = rendered.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, variable, content) => {
      return data[variable] ? content : '';
    });

    // Handle {{#each array}} blocks
    rendered = rendered.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, variable, content) => {
      const array = data[variable];
      if (!Array.isArray(array) || array.length === 0) return '';

      return array.map(item => {
        let itemContent = content;
        // Replace this.property with item values
        itemContent = itemContent.replace(/\{\{this\.(\w+)\}\}/g, (m, prop) => {
          return item[prop] !== undefined ? item[prop] : '';
        });
        // Handle nested conditionals like {{#if (eq this.type 'value')}}
        itemContent = itemContent.replace(/\{\{#if\s+\(eq\s+this\.(\w+)\s+'([^']+)'\)\}\}([\s\S]*?)\{\{else if\s+\(eq\s+this\.(\w+)\s+'([^']+)'\)\}\}([\s\S]*?)\{\{\/if\}\}/g,
          (m, prop1, val1, content1, prop2, val2, content2) => {
            if (item[prop1] === val1) return content1;
            if (item[prop2] === val2) return content2;
            return '';
          });
        itemContent = itemContent.replace(/\{\{#if\s+\(eq\s+this\.(\w+)\s+'([^']+)'\)\}\}([\s\S]*?)\{\{\/if\}\}/g,
          (m, prop, val, content) => {
            return item[prop] === val ? content : '';
          });
        return itemContent;
      }).join('');
    });

    // Handle simple {{variable}} replacements
    rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return data[variable] !== undefined ? data[variable] : '';
    });

    return rendered;
  }

  /**
   * Format transaction data for email templates
   * @param {Object} transaction - Transaction document from database
   * @returns {Object} Formatted data for templates
   */
  formatTransactionData(transaction) {
    const paymentMethodMap = {
      credit_card: 'Credit Card',
      debit_card: 'Debit Card',
      net_banking: 'Net Banking',
      upi: 'UPI',
      wallet: 'Digital Wallet',
      unknown: 'Unknown',
    };

    return {
      transactionId: transaction.transaction_id || transaction.transactionId,
      transactionDate: new Date(transaction.completed_at || transaction.completedAt || transaction.initiated_at || transaction.initiatedAt).toLocaleString('en-IN', {
        dateStyle: 'long',
        timeStyle: 'short',
      }),
      paymentMethod: paymentMethodMap[transaction.payment_method || transaction.paymentMethod] || 'Unknown',
      cardLast4: (transaction.payment_method_details || transaction.paymentMethodDetails)?.cardLast4 || null,
      originalAmount: this.formatAmount(transaction.original_amount || transaction.originalAmount),
      discountAmount: this.formatAmount(transaction.discount_amount || transaction.discountAmount),
      finalAmount: this.formatAmount(transaction.final_amount || transaction.finalAmount),
      gstAmount: this.formatAmount(transaction.gst_amount || transaction.gstAmount),
      discountCode: transaction.discount_code || transaction.discountCode || null,
      discountApplied: (transaction.discount_amount || transaction.discountAmount) && parseFloat((transaction.discount_amount || transaction.discountAmount).toString()) > 0,
      receiptNumber: transaction.receipt_number || transaction.receiptNumber || 'N/A',
    };
  }

  /**
   * Format Decimal128 amount to string with 2 decimal places
   * @param {Decimal128} amount - Amount to format
   * @returns {string} Formatted amount
   */
  formatAmount(amount) {
    if (amount === undefined || amount === null) return '0.00';
    return parseFloat(amount.toString()).toFixed(2);
  }

  /**
   * Send payment confirmation email with receipt attachment
   * Requirements: 3.9, 9.7
   * 
   * @param {Object} transaction - Transaction document
   * @param {Object} student - Student user document
   * @param {Object} course - Course document
   * @param {string} receiptPath - Path to receipt PDF file (optional)
   * @returns {Promise<Object>} Email send result
   */
  async sendPaymentConfirmation(transaction, student, course, receiptPath = null) {
    try {
      // Load template
      const template = await this.loadTemplate('payment-success');

      // Prepare template data
      const transactionData = this.formatTransactionData(transaction);
      const templateData = {
        ...transactionData,
        studentName: student.name,
        courseTitle: course.title,
        courseAccessUrl: `${this.companyInfo.websiteUrl}/courses/${course.id || course._id}`,
        receiptDownloadUrl: transaction.receipt_url || transaction.receiptUrl || `${this.companyInfo.websiteUrl}/api/payment/receipt/${transaction.transaction_id || transaction.transactionId}`,
        ...this.companyInfo,
      };

      // Render template
      const html = this.renderTemplate(template, templateData);

      // Prepare attachments
      const attachments = [];
      if (receiptPath) {
        attachments.push({
          filename: `Receipt-${transaction.transactionId}.pdf`,
          path: receiptPath,
          contentType: 'application/pdf',
        });
      }

      // Send email
      const result = await sendEmail({
        email: student.email,
        subject: `Payment Successful - ${course.title}`,
        html,
        attachments,
      });

      console.log(`Payment confirmation email sent to ${student.email} for transaction ${transaction.transactionId}`);
      return result;
    } catch (error) {
      console.error('Error sending payment confirmation email:', error);
      throw new Error('Failed to send payment confirmation email');
    }
  }

  /**
   * Send payment failure notification email
   * Requirements: 7.7
   * 
   * @param {Object} transaction - Transaction document
   * @param {Object} student - Student user document
   * @param {Object} course - Course document
   * @returns {Promise<Object>} Email send result
   */
  async sendPaymentFailure(transaction, student, course) {
    try {
      // Load template
      const template = await this.loadTemplate('payment-failure');

      // Prepare template data
      const transactionData = this.formatTransactionData(transaction);
      const retriesRemaining = Math.max(0, 3 - (transaction.retryCount || 0));

      const templateData = {
        ...transactionData,
        studentName: student.name,
        courseTitle: course.title,
        errorMessage: transaction.errorMessage || 'Payment could not be processed. Please try again.',
        retriesRemaining,
        retryPaymentUrl: `${this.companyInfo.websiteUrl}/payment/retry/${transaction.transactionId}`,
        ...this.companyInfo,
      };

      // Render template
      const html = this.renderTemplate(template, templateData);

      // Send email
      const result = await sendEmail({
        email: student.email,
        subject: `Payment Failed - ${course.title}`,
        html,
      });

      console.log(`Payment failure email sent to ${student.email} for transaction ${transaction.transactionId}`);
      return result;
    } catch (error) {
      console.error('Error sending payment failure email:', error);
      throw new Error('Failed to send payment failure email');
    }
  }

  /**
   * Send refund confirmation email
   * Requirements: 8.8
   * 
   * @param {Object} transaction - Transaction document
   * @param {Object} student - Student user document
   * @param {Object} course - Course document
   * @returns {Promise<Object>} Email send result
   */
  async sendRefundConfirmation(transaction, student, course) {
    try {
      // Load template
      const template = await this.loadTemplate('refund-confirmation');

      // Calculate expected refund date (5-7 business days)
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 7);

      // Prepare template data
      const transactionData = this.formatTransactionData(transaction);
      const templateData = {
        ...transactionData,
        studentName: student.name,
        courseTitle: course.title,
        refundTransactionId: transaction.refundTransactionId || 'Processing',
        originalTransactionId: transaction.transaction_id || transaction.transactionId,
        originalPaymentDate: new Date(transaction.completed_at || transaction.completedAt).toLocaleString('en-IN', {
          dateStyle: 'long',
        }),
        refundProcessedDate: new Date(transaction.refund_initiated_at || transaction.refundInitiatedAt).toLocaleString('en-IN', {
          dateStyle: 'long',
          timeStyle: 'short',
        }),
        refundInitiatedDate: new Date(transaction.refund_initiated_at || transaction.refundInitiatedAt).toLocaleString('en-IN', {
          dateStyle: 'long',
          timeStyle: 'short',
        }),
        expectedRefundDate: expectedDate.toLocaleString('en-IN', {
          dateStyle: 'long',
        }),
        refundAmount: this.formatAmount(transaction.refundAmount || transaction.finalAmount),
        refundType: transaction.refundAmount && parseFloat(transaction.refundAmount.toString()) < parseFloat(transaction.finalAmount.toString())
          ? 'Partial Refund'
          : 'Full Refund',
        transactionHistoryUrl: `${this.companyInfo.websiteUrl}/payment/history`,
        ...this.companyInfo,
      };

      // Render template
      const html = this.renderTemplate(template, templateData);

      // Send email
      const result = await sendEmail({
        email: student.email,
        subject: `Refund Processed - ${course.title}`,
        html,
      });

      console.log(`Refund confirmation email sent to ${student.email} for transaction ${transaction.transactionId}`);
      return result;
    } catch (error) {
      console.error('Error sending refund confirmation email:', error);
      throw new Error('Failed to send refund confirmation email');
    }
  }

  /**
   * Send daily reconciliation summary email to finance team
   * Requirements: 10.10
   * 
   * @param {Object} reconciliation - Reconciliation document
   * @param {Array<string>} financeEmails - Array of finance team email addresses
   * @returns {Promise<Object>} Email send result
   */
  async sendReconciliationSummary(reconciliation, financeEmails) {
    try {
      // Load template
      const template = await this.loadTemplate('reconciliation-summary');

      // Format discrepancies for template
      const formattedDiscrepancies = reconciliation.discrepancies.map(disc => ({
        transactionId: disc.transactionId,
        type: disc.type,
        systemAmount: this.formatAmount(disc.systemAmount),
        gatewayAmount: this.formatAmount(disc.gatewayAmount),
        difference: Math.abs(
          parseFloat(this.formatAmount(disc.systemAmount)) -
          parseFloat(this.formatAmount(disc.gatewayAmount))
        ).toFixed(2),
      }));

      // Prepare template data
      const templateData = {
        reconciliationId: (reconciliation.id || reconciliation._id).toString(),
        reconciliationDate: new Date(reconciliation.reconciliation_date || reconciliation.reconciliationDate).toLocaleDateString('en-IN', {
          dateStyle: 'long',
        }),
        startDate: new Date(reconciliation.start_date || reconciliation.startDate).toLocaleDateString('en-IN'),
        endDate: new Date(reconciliation.end_date || reconciliation.endDate).toLocaleDateString('en-IN'),
        totalTransactions: reconciliation.total_transactions || reconciliation.totalTransactions,
        matchedTransactions: reconciliation.matched_transactions || reconciliation.matchedTransactions,
        unmatchedTransactions: reconciliation.unmatched_transactions || reconciliation.unmatchedTransactions,
        discrepancyCount: reconciliation.discrepancies.length,
        totalAmount: this.formatAmount(reconciliation.total_amount || reconciliation.totalAmount),
        settledAmount: this.formatAmount(reconciliation.settled_amount || reconciliation.settledAmount),
        pendingAmount: this.formatAmount(reconciliation.pending_amount || reconciliation.pendingAmount),
        refundAmount: this.formatAmount(reconciliation.refunded_amount || reconciliation.refundedAmount || 0),
        netSettlement: this.formatAmount(reconciliation.net_settlement_amount || reconciliation.netSettlementAmount),
        hasDiscrepancies: reconciliation.discrepancies.length > 0,
        discrepancies: formattedDiscrepancies,
        reconciliationStatus: reconciliation.status === 'completed' ? 'Completed' : (reconciliation.status === 'resolved' ? 'Resolved/Action Required' : 'In Progress'),
        reportGeneratedDate: new Date().toLocaleString('en-IN', {
          dateStyle: 'long',
          timeStyle: 'short',
        }),
        reconciliationDashboardUrl: `${this.companyInfo.websiteUrl}/admin/reconciliation/${reconciliation.id || reconciliation._id}`,
        resolveDiscrepanciesUrl: `${this.companyInfo.websiteUrl}/admin/reconciliation/${reconciliation.id || reconciliation._id}/resolve`,
        dashboardUrl: `${this.companyInfo.websiteUrl}/admin/finance`,
        reportsUrl: `${this.companyInfo.websiteUrl}/admin/reports`,
        ...this.companyInfo,
      };

      // Render template
      const html = this.renderTemplate(template, templateData);

      // Send email to all finance team members
      const emailPromises = financeEmails.map(email =>
        sendEmail({
          email,
          subject: `Daily Reconciliation Report - ${templateData.reconciliationDate}`,
          html,
        })
      );

      const results = await Promise.all(emailPromises);
      console.log(`Reconciliation summary email sent to ${financeEmails.length} finance team members`);
      return results;
    } catch (error) {
      console.error('Error sending reconciliation summary email:', error);
      throw new Error('Failed to send reconciliation summary email');
    }
  }
}

module.exports = EmailService;
