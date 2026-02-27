const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Transaction = require('../../models/payment/Transaction');
const sendEmail = require('../../utils/sendEmail');

/**
 * Receipt Generator Service
 * 
 * Generates professional PDF receipts for successful payment transactions.
 * Includes transaction details, student info, course info, GST breakdown,
 * and company details.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.10
 */
class ReceiptGeneratorService {
  constructor() {
    // Ensure receipts directory exists
    this.receiptsDir = path.join(__dirname, '../../uploads/receipts');
    if (!fs.existsSync(this.receiptsDir)) {
      fs.mkdirSync(this.receiptsDir, { recursive: true });
    }

    // Company details
    this.companyDetails = {
      name: 'SkillDad',
      address: 'Bangalore, Karnataka, India',
      email: 'support@skilldad.com',
      phone: '+91-XXXXXXXXXX',
      gstin: 'XXGSTIN123456XX', // Replace with actual GSTIN
      website: 'www.skilldad.com'
    };
  }

  /**
   * Generate unique receipt number
   * Format: RCP-YYYYMMDD-XXXXX
   * 
   * Requirement: 9.10
   */
  generateReceiptNumber() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    return `RCP-${dateStr}-${random}`;
  }

  /**
   * Format currency amount
   */
  formatAmount(amount) {
    if (!amount) return '₹0.00';
    const value = typeof amount === 'object' ? parseFloat(amount.toString()) : parseFloat(amount);
    return `₹${value.toFixed(2)}`;
  }

  /**
   * Generate receipt PDF from transaction data
   * 
   * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 9.10
   * 
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} Receipt details with URL
   */
  async generateReceipt(transactionId) {
    try {
      // Fetch transaction with populated references
      const transaction = await Transaction.findOne({ transactionId })
        .populate('student', 'name email phone')
        .populate('course', 'title price');

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'success') {
        throw new Error('Cannot generate receipt for non-successful transaction');
      }

      // Generate receipt number if not exists
      if (!transaction.receiptNumber) {
        transaction.receiptNumber = this.generateReceiptNumber();
        await transaction.save();
      }

      // Generate PDF
      const filename = `${transaction.receiptNumber}.pdf`;
      const filepath = path.join(this.receiptsDir, filename);
      const receiptUrl = `/uploads/receipts/${filename}`;

      await this.createPDF(transaction, filepath);

      // Update transaction with receipt URL
      transaction.receiptUrl = receiptUrl;
      transaction.receiptGeneratedAt = new Date();
      await transaction.save();

      return {
        receiptNumber: transaction.receiptNumber,
        receiptUrl,
        filepath
      };
    } catch (error) {
      console.error('Error generating receipt:', error);
      throw error;
    }
  }

  /**
   * Create PDF document
   * 
   * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
   */
  async createPDF(transaction, filepath) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const stream = fs.createWriteStream(filepath);

        doc.pipe(stream);

        // Header with company branding
        this.addHeader(doc);

        // Receipt title and number
        this.addReceiptTitle(doc, transaction);

        // Transaction details
        this.addTransactionDetails(doc, transaction);

        // Student information
        this.addStudentInfo(doc, transaction);

        // Course information
        this.addCourseInfo(doc, transaction);

        // Payment method details
        this.addPaymentMethodDetails(doc, transaction);

        // Amount breakdown with GST
        this.addAmountBreakdown(doc, transaction);

        // Footer with company details
        this.addFooter(doc);

        doc.end();

        stream.on('finish', resolve);
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add header section
   * Requirement: 9.5
   */
  addHeader(doc) {
    doc
      .fontSize(24)
      .fillColor('#7C3AED')
      .text(this.companyDetails.name, 50, 50, { align: 'left' })
      .fontSize(10)
      .fillColor('#666666')
      .text(this.companyDetails.address, 50, 80)
      .text(`Email: ${this.companyDetails.email}`, 50, 95)
      .text(`Phone: ${this.companyDetails.phone}`, 50, 110)
      .text(`GSTIN: ${this.companyDetails.gstin}`, 50, 125)
      .text(`Website: ${this.companyDetails.website}`, 50, 140);

    // Horizontal line
    doc
      .strokeColor('#E5E7EB')
      .lineWidth(1)
      .moveTo(50, 160)
      .lineTo(545, 160)
      .stroke();
  }

  /**
   * Add receipt title and number
   * Requirement: 9.10
   */
  addReceiptTitle(doc, transaction) {
    doc
      .fontSize(20)
      .fillColor('#111827')
      .text('PAYMENT RECEIPT', 50, 180, { align: 'center' })
      .fontSize(12)
      .fillColor('#7C3AED')
      .text(`Receipt No: ${transaction.receiptNumber}`, 50, 210, { align: 'center' });
  }

  /**
   * Add transaction details
   * Requirement: 9.1
   */
  addTransactionDetails(doc, transaction) {
    const yStart = 250;

    doc
      .fontSize(14)
      .fillColor('#111827')
      .text('Transaction Details', 50, yStart);

    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('Transaction ID:', 50, yStart + 25)
      .fillColor('#111827')
      .text(transaction.transactionId, 200, yStart + 25)
      
      .fillColor('#666666')
      .text('Gateway Transaction ID:', 50, yStart + 45)
      .fillColor('#111827')
      .text(transaction.gatewayTransactionId || 'N/A', 200, yStart + 45)
      
      .fillColor('#666666')
      .text('Transaction Date:', 50, yStart + 65)
      .fillColor('#111827')
      .text(new Date(transaction.completedAt || transaction.createdAt).toLocaleString('en-IN'), 200, yStart + 65)
      
      .fillColor('#666666')
      .text('Status:', 50, yStart + 85)
      .fillColor('#10B981')
      .text(transaction.status.toUpperCase(), 200, yStart + 85);
  }

  /**
   * Add student information
   * Requirement: 9.2
   */
  addStudentInfo(doc, transaction) {
    const yStart = 380;

    doc
      .fontSize(14)
      .fillColor('#111827')
      .text('Student Information', 50, yStart);

    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('Name:', 50, yStart + 25)
      .fillColor('#111827')
      .text(transaction.student?.name || 'N/A', 200, yStart + 25)
      
      .fillColor('#666666')
      .text('Email:', 50, yStart + 45)
      .fillColor('#111827')
      .text(transaction.student?.email || 'N/A', 200, yStart + 45)
      
      .fillColor('#666666')
      .text('Phone:', 50, yStart + 65)
      .fillColor('#111827')
      .text(transaction.student?.phone || 'N/A', 200, yStart + 65);
  }

  /**
   * Add course information
   * Requirement: 9.1
   */
  addCourseInfo(doc, transaction) {
    const yStart = 490;

    doc
      .fontSize(14)
      .fillColor('#111827')
      .text('Course Details', 50, yStart);

    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('Course Name:', 50, yStart + 25)
      .fillColor('#111827')
      .text(transaction.course?.title || 'N/A', 200, yStart + 25, { width: 345 });
  }

  /**
   * Add payment method details
   * Requirement: 9.3
   */
  addPaymentMethodDetails(doc, transaction) {
    const yStart = 560;

    doc
      .fontSize(14)
      .fillColor('#111827')
      .text('Payment Method', 50, yStart);

    let paymentMethodText = transaction.paymentMethod?.replace(/_/g, ' ').toUpperCase() || 'N/A';
    
    // Add card details if available
    if (transaction.paymentMethodDetails?.cardLast4) {
      paymentMethodText += ` - ${transaction.paymentMethodDetails.cardType || 'Card'} ending in ${transaction.paymentMethodDetails.cardLast4}`;
    } else if (transaction.paymentMethodDetails?.bankName) {
      paymentMethodText += ` - ${transaction.paymentMethodDetails.bankName}`;
    } else if (transaction.paymentMethodDetails?.walletProvider) {
      paymentMethodText += ` - ${transaction.paymentMethodDetails.walletProvider}`;
    }

    doc
      .fontSize(10)
      .fillColor('#111827')
      .text(paymentMethodText, 50, yStart + 25);
  }

  /**
   * Add amount breakdown with GST
   * Requirement: 9.4
   */
  addAmountBreakdown(doc, transaction) {
    const yStart = 620;

    doc
      .fontSize(14)
      .fillColor('#111827')
      .text('Amount Breakdown', 50, yStart);

    // Draw table
    const tableTop = yStart + 30;
    const col1 = 50;
    const col2 = 400;

    // Original amount
    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('Original Amount:', col1, tableTop)
      .fillColor('#111827')
      .text(this.formatAmount(transaction.originalAmount), col2, tableTop, { align: 'right', width: 145 });

    // Discount
    if (transaction.discountAmount && parseFloat(transaction.discountAmount.toString()) > 0) {
      doc
        .fillColor('#666666')
        .text('Discount:', col1, tableTop + 20)
        .fillColor('#10B981')
        .text(`- ${this.formatAmount(transaction.discountAmount)}`, col2, tableTop + 20, { align: 'right', width: 145 });

      if (transaction.discountCode) {
        doc
          .fontSize(8)
          .fillColor('#7C3AED')
          .text(`(Code: ${transaction.discountCode})`, col1 + 80, tableTop + 20);
      }
    }

    // Subtotal
    const subtotalY = transaction.discountAmount && parseFloat(transaction.discountAmount.toString()) > 0 ? tableTop + 40 : tableTop + 20;
    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('Subtotal:', col1, subtotalY)
      .fillColor('#111827')
      .text(this.formatAmount(transaction.finalAmount), col2, subtotalY, { align: 'right', width: 145 });

    // GST
    let gstY = subtotalY + 20;
    if (transaction.gstAmount && parseFloat(transaction.gstAmount.toString()) > 0) {
      doc
        .fillColor('#666666')
        .text('GST (18%):', col1, gstY)
        .fillColor('#111827')
        .text(this.formatAmount(transaction.gstAmount), col2, gstY, { align: 'right', width: 145 });
      gstY += 20;
    }

    // Line separator
    doc
      .strokeColor('#E5E7EB')
      .lineWidth(1)
      .moveTo(col1, gstY + 5)
      .lineTo(545, gstY + 5)
      .stroke();

    // Total amount
    const totalAmount = transaction.gstAmount && parseFloat(transaction.gstAmount.toString()) > 0
      ? parseFloat(transaction.finalAmount.toString()) + parseFloat(transaction.gstAmount.toString())
      : parseFloat(transaction.finalAmount.toString());

    doc
      .fontSize(12)
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .text('Total Amount Paid:', col1, gstY + 15)
      .text(this.formatAmount(totalAmount), col2, gstY + 15, { align: 'right', width: 145 })
      .font('Helvetica');
  }

  /**
   * Add footer
   * Requirement: 9.5
   */
  addFooter(doc) {
    const footerY = 750;

    doc
      .fontSize(8)
      .fillColor('#999999')
      .text('This is a computer-generated receipt and does not require a signature.', 50, footerY, { align: 'center', width: 495 })
      .text('For any queries, please contact us at support@skilldad.com', 50, footerY + 15, { align: 'center', width: 495 })
      .text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 50, footerY + 30, { align: 'center', width: 495 });
  }

  /**
   * Email receipt to student
   * 
   * Requirement: 9.7
   * 
   * @param {string} transactionId - Transaction ID
   * @param {string} studentEmail - Student email (optional, will use transaction student email if not provided)
   * @returns {Promise<Object>} Email send result
   */
  async emailReceipt(transactionId, studentEmail = null) {
    try {
      // Generate receipt if not already generated
      const receiptData = await this.generateReceipt(transactionId);

      // Fetch transaction for email details
      const transaction = await Transaction.findOne({ transactionId })
        .populate('student', 'name email')
        .populate('course', 'title');

      const recipientEmail = studentEmail || transaction.student?.email;

      if (!recipientEmail) {
        throw new Error('Student email not found');
      }

      // Send email with receipt attachment
      const emailResult = await sendEmail({
        email: recipientEmail,
        subject: `Payment Receipt - ${transaction.receiptNumber}`,
        html: this.generateReceiptEmailHTML(transaction, receiptData),
        attachments: [
          {
            filename: `${transaction.receiptNumber}.pdf`,
            path: receiptData.filepath
          }
        ]
      });

      return {
        success: true,
        receiptNumber: transaction.receiptNumber,
        sentTo: recipientEmail,
        emailResult
      };
    } catch (error) {
      console.error('Error emailing receipt:', error);
      throw error;
    }
  }

  /**
   * Generate HTML email content for receipt
   */
  generateReceiptEmailHTML(transaction, receiptData) {
    const totalAmount = transaction.gstAmount && parseFloat(transaction.gstAmount.toString()) > 0
      ? parseFloat(transaction.finalAmount.toString()) + parseFloat(transaction.gstAmount.toString())
      : parseFloat(transaction.finalAmount.toString());

    return `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; color: #1F2937; background-color: #F9FAFB; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          <div style="padding: 32px 40px; background: linear-gradient(135deg, #7C3AED 0%, #C026D3 100%); text-align: center; color: #FFFFFF;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">SkillDad</h1>
            <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9; font-weight: 500;">Payment Receipt</p>
          </div>
          <div style="padding: 40px;">
            <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #111827;">Payment Successful!</h2>
            <p style="margin: 0 0 16px 0; font-size: 16px; color: #4B5563;">
              Hello <strong>${transaction.student?.name}</strong>,
            </p>
            <p style="margin: 0 0 16px 0; font-size: 16px; color: #4B5563;">
              Thank you for your payment. Your transaction has been processed successfully.
            </p>
            <div style="background-color: #F5F3FF; border: 1px solid #DDD6FE; padding: 24px; border-radius: 12px; margin: 24px 0;">
              <p style="margin: 0 0 8px 0;"><strong style="color: #7C3AED;">Receipt Number:</strong> ${transaction.receiptNumber}</p>
              <p style="margin: 0 0 8px 0;"><strong style="color: #7C3AED;">Transaction ID:</strong> ${transaction.transactionId}</p>
              <p style="margin: 0 0 8px 0;"><strong style="color: #7C3AED;">Course:</strong> ${transaction.course?.title}</p>
              <p style="margin: 0;"><strong style="color: #7C3AED;">Amount Paid:</strong> ${this.formatAmount(totalAmount)}</p>
            </div>
            <p style="margin: 0 0 16px 0; font-size: 16px; color: #4B5563;">
              Your payment receipt is attached to this email. You can also download it anytime from your dashboard.
            </p>
          </div>
          <div style="padding: 32px; background-color: #F3F4F6; text-align: center; font-size: 13px; color: #6B7280;">
            <p style="margin: 0 0 12px 0;">&copy; ${new Date().getFullYear()} SkillDad. All rights reserved.</p>
            <p style="margin: 0;">If you have any questions, contact us at support@skilldad.com</p>
          </div>
        </div>
      </div>
    `;
  }
}

module.exports = ReceiptGeneratorService;
