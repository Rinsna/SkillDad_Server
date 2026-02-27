# ReceiptGeneratorService Usage Guide

## Overview

The `ReceiptGeneratorService` generates professional PDF receipts for successful payment transactions and can email them to students.

## Features

- ✅ Generates PDF receipts with transaction details
- ✅ Includes student information, course details, and payment method
- ✅ Shows GST breakdown and discount information
- ✅ Generates unique receipt numbers (format: RCP-YYYYMMDD-XXXXX)
- ✅ Stores receipts in `/uploads/receipts/` directory
- ✅ Emails receipts as PDF attachments
- ✅ Professional branding with SkillDad styling

## Requirements Covered

- **9.1**: Transaction details with ID, date, amount, and course info
- **9.2**: Student name, email, and billing information
- **9.3**: Payment method and last 4 digits of card
- **9.4**: GST breakdown
- **9.5**: Company details and GSTIN
- **9.6**: PDF download link
- **9.7**: Email receipt as attachment
- **9.8**: Receipt URL stored in transaction record
- **9.10**: Unique receipt number for accounting

## Installation

The service requires `pdfkit` for PDF generation:

```bash
npm install pdfkit
```

## Basic Usage

### 1. Generate Receipt

```javascript
const ReceiptGeneratorService = require('./services/payment/ReceiptGeneratorService');

const receiptService = new ReceiptGeneratorService();

// Generate receipt for a transaction
const receipt = await receiptService.generateReceipt('TXN_1234567890');

console.log(receipt);
// Output:
// {
//   receiptNumber: 'RCP-20240115-12345',
//   receiptUrl: '/uploads/receipts/RCP-20240115-12345.pdf',
//   filepath: '/path/to/server/uploads/receipts/RCP-20240115-12345.pdf'
// }
```

### 2. Email Receipt

```javascript
// Email receipt to student
const result = await receiptService.emailReceipt('TXN_1234567890');

console.log(result);
// Output:
// {
//   success: true,
//   receiptNumber: 'RCP-20240115-12345',
//   sentTo: 'student@example.com',
//   emailResult: { ... }
// }

// Email to custom address
const result = await receiptService.emailReceipt(
  'TXN_1234567890',
  'custom@example.com'
);
```

## Integration with Payment Controller

### After Successful Payment

```javascript
const ReceiptGeneratorService = require('../services/payment/ReceiptGeneratorService');

class PaymentController {
  async handleCallback(req, res) {
    // ... payment verification logic ...

    if (paymentStatus === 'success') {
      // Update transaction status
      transaction.status = 'success';
      await transaction.save();

      // Generate and email receipt
      const receiptService = new ReceiptGeneratorService();
      try {
        await receiptService.emailReceipt(transaction.transactionId);
        console.log('Receipt emailed successfully');
      } catch (error) {
        console.error('Failed to email receipt:', error);
        // Don't fail the payment if receipt email fails
      }

      // ... rest of success handling ...
    }
  }
}
```

### Download Receipt Endpoint

```javascript
// In payment routes
router.get('/receipt/:transactionId', async (req, res) => {
  try {
    const receiptService = new ReceiptGeneratorService();
    const receipt = await receiptService.generateReceipt(req.params.transactionId);
    
    // Send file for download
    res.download(receipt.filepath, `${receipt.receiptNumber}.pdf`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Receipt Format

The generated PDF includes:

### Header Section
- Company name (SkillDad)
- Company address
- Email and phone
- GSTIN number
- Website

### Receipt Title
- "PAYMENT RECEIPT" heading
- Unique receipt number

### Transaction Details
- Transaction ID
- Gateway Transaction ID
- Transaction date
- Status

### Student Information
- Name
- Email
- Phone number

### Course Details
- Course name/title

### Payment Method
- Payment method type
- Card details (last 4 digits) if applicable
- Bank name for net banking
- Wallet provider for wallet payments

### Amount Breakdown
- Original amount
- Discount (if applicable)
- Subtotal
- GST (18% if applicable)
- **Total amount paid** (bold)

### Footer
- Computer-generated receipt notice
- Support contact information
- Generation timestamp

## Email Template

The email includes:
- Professional SkillDad branding
- Payment success message
- Key transaction details (receipt number, transaction ID, course, amount)
- PDF receipt as attachment
- Support contact information

## Configuration

### Company Details

Update company details in the constructor:

```javascript
this.companyDetails = {
  name: 'SkillDad',
  address: 'Bangalore, Karnataka, India',
  email: 'support@skilldad.com',
  phone: '+91-XXXXXXXXXX',
  gstin: 'XXGSTIN123456XX', // Replace with actual GSTIN
  website: 'www.skilldad.com'
};
```

### Receipts Directory

Receipts are stored in: `server/uploads/receipts/`

The directory is automatically created if it doesn't exist.

## Error Handling

```javascript
try {
  const receipt = await receiptService.generateReceipt(transactionId);
} catch (error) {
  if (error.message === 'Transaction not found') {
    // Handle missing transaction
  } else if (error.message === 'Cannot generate receipt for non-successful transaction') {
    // Handle invalid transaction status
  } else {
    // Handle other errors
  }
}
```

## Testing

Run the manual test script:

```bash
node server/services/payment/test-receipt-manual.js
```

This will:
1. Test receipt number generation
2. Test amount formatting
3. Generate a sample PDF receipt
4. Test email HTML generation

## Notes

- Receipts are only generated for transactions with `status: 'success'`
- Receipt numbers are unique and follow the format: `RCP-YYYYMMDD-XXXXX`
- If a receipt already exists for a transaction, it will be reused
- Email sending requires proper SMTP configuration in `.env`
- PDF files are stored permanently for audit and compliance purposes

## Future Enhancements

Potential improvements:
- Cloud storage integration (AWS S3, Google Cloud Storage)
- Multiple language support
- Customizable receipt templates
- Bulk receipt generation
- Receipt regeneration with updated details
