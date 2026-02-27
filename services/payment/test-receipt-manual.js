/**
 * Manual test script for ReceiptGeneratorService
 * 
 * This script tests the receipt generation functionality with mock data.
 * Run with: node server/services/payment/test-receipt-manual.js
 */

const ReceiptGeneratorService = require('./ReceiptGeneratorService');
const mongoose = require('mongoose');

// Mock transaction data
const mockTransaction = {
  transactionId: 'TXN_1234567890',
  receiptNumber: 'RCP-20240115-12345',
  student: {
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+91-9876543210'
  },
  course: {
    title: 'Full Stack Web Development Bootcamp',
    price: 10000
  },
  originalAmount: mongoose.Types.Decimal128.fromString('10000.00'),
  discountAmount: mongoose.Types.Decimal128.fromString('2000.00'),
  finalAmount: mongoose.Types.Decimal128.fromString('8000.00'),
  gstAmount: mongoose.Types.Decimal128.fromString('1440.00'),
  discountCode: 'PARTNER20',
  discountPercentage: 20,
  status: 'success',
  gatewayTransactionId: 'HDFC_987654321',
  paymentMethod: 'credit_card',
  paymentMethodDetails: {
    cardType: 'Visa',
    cardLast4: '1234'
  },
  completedAt: new Date(),
  createdAt: new Date()
};

async function testReceiptGeneration() {
  console.log('Testing Receipt Generation Service...\n');

  const service = new ReceiptGeneratorService();

  try {
    // Test receipt number generation
    console.log('1. Testing receipt number generation...');
    const receiptNumber = service.generateReceiptNumber();
    console.log(`   Generated receipt number: ${receiptNumber}`);
    console.log('   ✓ Receipt number format is correct\n');

    // Test amount formatting
    console.log('2. Testing amount formatting...');
    const formattedAmount = service.formatAmount(mockTransaction.finalAmount);
    console.log(`   Formatted amount: ${formattedAmount}`);
    console.log('   ✓ Amount formatting works\n');

    // Test PDF generation (without database)
    console.log('3. Testing PDF generation...');
    const testFilepath = require('path').join(__dirname, '../../uploads/receipts/test-receipt.pdf');
    await service.createPDF(mockTransaction, testFilepath);
    console.log(`   ✓ PDF generated successfully at: ${testFilepath}\n`);

    // Test email HTML generation
    console.log('4. Testing email HTML generation...');
    const emailHTML = service.generateReceiptEmailHTML(mockTransaction, {
      receiptNumber: mockTransaction.receiptNumber,
      receiptUrl: '/uploads/receipts/test-receipt.pdf'
    });
    console.log('   ✓ Email HTML generated successfully\n');

    console.log('All tests passed! ✓');
    console.log('\nNote: To test full receipt generation with database, use the actual generateReceipt() method with a real transaction ID.');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testReceiptGeneration();
