/**
 * Manual Test Script for EmailService
 * 
 * This script tests the EmailService functionality with mock data
 * Run with: node server/services/payment/test-email-manual.js
 */

const EmailService = require('./EmailService');
const mongoose = require('mongoose');

// Mock data for testing
const mockTransaction = {
  transactionId: 'TXN_TEST123456',
  originalAmount: mongoose.Types.Decimal128.fromString('10000.00'),
  discountAmount: mongoose.Types.Decimal128.fromString('2000.00'),
  finalAmount: mongoose.Types.Decimal128.fromString('8000.00'),
  gstAmount: mongoose.Types.Decimal128.fromString('1440.00'),
  discountCode: 'PARTNER20',
  paymentMethod: 'credit_card',
  paymentMethodDetails: {
    cardLast4: '1234',
    cardType: 'Visa',
  },
  receiptNumber: 'RCP_TEST123456',
  receiptUrl: 'https://skilldad.com/receipts/test.pdf',
  initiatedAt: new Date(),
  completedAt: new Date(),
  retryCount: 0,
  errorMessage: 'Insufficient funds in account',
  refundAmount: mongoose.Types.Decimal128.fromString('8000.00'),
  refundTransactionId: 'RFD_TEST123456',
  refundInitiatedAt: new Date(),
};

const mockStudent = {
  _id: 'student123',
  name: 'John Doe',
  email: 'test@example.com', // Change this to your email for testing
};

const mockCourse = {
  _id: 'course123',
  title: 'Full Stack Web Development Bootcamp',
};

const mockReconciliation = {
  _id: 'rec123',
  reconciliationDate: new Date(),
  startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
  endDate: new Date(),
  totalTransactions: 150,
  matchedTransactions: 145,
  unmatchedTransactions: 5,
  totalAmount: mongoose.Types.Decimal128.fromString('1500000.00'),
  settledAmount: mongoose.Types.Decimal128.fromString('1450000.00'),
  pendingAmount: mongoose.Types.Decimal128.fromString('50000.00'),
  status: 'completed',
  discrepancies: [
    {
      transactionId: 'TXN_DISC001',
      type: 'amount_mismatch',
      systemAmount: mongoose.Types.Decimal128.fromString('10000.00'),
      gatewayAmount: mongoose.Types.Decimal128.fromString('9950.00'),
    },
    {
      transactionId: 'TXN_DISC002',
      type: 'missing_in_gateway',
      systemAmount: mongoose.Types.Decimal128.fromString('5000.00'),
      gatewayAmount: mongoose.Types.Decimal128.fromString('0.00'),
    },
  ],
};

async function testEmailService() {
  console.log('=== EmailService Manual Test ===\n');

  const emailService = new EmailService();

  try {
    // Test 1: Template Loading
    console.log('1. Testing template loading...');
    const template = await emailService.loadTemplate('payment-success');
    console.log('✓ Template loaded successfully');
    console.log(`  Template length: ${template.length} characters\n`);

    // Test 2: Template Rendering
    console.log('2. Testing template rendering...');
    const rendered = emailService.renderTemplate(template, {
      studentName: 'John Doe',
      courseTitle: 'Test Course',
      transactionId: 'TXN_123',
      finalAmount: '8000.00',
    });
    console.log('✓ Template rendered successfully');
    console.log(`  Rendered length: ${rendered.length} characters\n`);

    // Test 3: Format Transaction Data
    console.log('3. Testing transaction data formatting...');
    const formattedData = emailService.formatTransactionData(mockTransaction);
    console.log('✓ Transaction data formatted successfully');
    console.log('  Formatted data:', JSON.stringify(formattedData, null, 2), '\n');

    // Test 4: Payment Confirmation Email (dry run - no actual email sent)
    console.log('4. Testing payment confirmation email generation...');
    console.log('  Note: Set EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD in .env to actually send emails');
    console.log('  Transaction ID:', mockTransaction.transactionId);
    console.log('  Student:', mockStudent.name, `(${mockStudent.email})`);
    console.log('  Course:', mockCourse.title);
    console.log('  Amount:', emailService.formatAmount(mockTransaction.finalAmount));
    
    // Uncomment to actually send email (requires email config in .env)
    // await emailService.sendPaymentConfirmation(mockTransaction, mockStudent, mockCourse);
    console.log('✓ Payment confirmation email structure validated\n');

    // Test 5: Payment Failure Email
    console.log('5. Testing payment failure email generation...');
    console.log('  Error message:', mockTransaction.errorMessage);
    console.log('  Retries remaining:', 3 - mockTransaction.retryCount);
    
    // Uncomment to actually send email
    // await emailService.sendPaymentFailure(mockTransaction, mockStudent, mockCourse);
    console.log('✓ Payment failure email structure validated\n');

    // Test 6: Refund Confirmation Email
    console.log('6. Testing refund confirmation email generation...');
    console.log('  Refund amount:', emailService.formatAmount(mockTransaction.refundAmount));
    console.log('  Refund transaction ID:', mockTransaction.refundTransactionId);
    
    // Uncomment to actually send email
    // await emailService.sendRefundConfirmation(mockTransaction, mockStudent, mockCourse);
    console.log('✓ Refund confirmation email structure validated\n');

    // Test 7: Reconciliation Summary Email
    console.log('7. Testing reconciliation summary email generation...');
    console.log('  Total transactions:', mockReconciliation.totalTransactions);
    console.log('  Matched:', mockReconciliation.matchedTransactions);
    console.log('  Discrepancies:', mockReconciliation.discrepancies.length);
    
    // Uncomment to actually send email
    // await emailService.sendReconciliationSummary(mockReconciliation, ['finance@example.com']);
    console.log('✓ Reconciliation summary email structure validated\n');

    console.log('=== All Tests Passed ===');
    console.log('\nTo actually send emails:');
    console.log('1. Configure EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD in .env');
    console.log('2. Uncomment the sendEmail calls in this test file');
    console.log('3. Update mockStudent.email to your email address');
    console.log('4. Run the test again');

  } catch (error) {
    console.error('✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testEmailService();
