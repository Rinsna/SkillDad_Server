# EmailService Usage Guide

## Overview

The `EmailService` class handles all payment-related email communications for the HDFC SmartGateway integration. It uses HTML email templates with a simple template rendering system and integrates with the existing `sendEmail` utility.

## Features

- **Payment Confirmation Emails**: Sent when payment succeeds, with optional receipt PDF attachment
- **Payment Failure Notifications**: Sent when payment fails, with retry information
- **Refund Confirmation Emails**: Sent when refund is processed
- **Reconciliation Summary Emails**: Daily automated reports for finance team

## Requirements Covered

- **3.9**: Send confirmation email to student when payment succeeds
- **7.7**: Send payment failure notification email to student
- **8.8**: Send refund confirmation email to student when refund succeeds
- **9.7**: Attach receipt PDF to confirmation emails
- **10.10**: Send automated reconciliation summary emails to finance team daily

## Installation

The EmailService is already integrated into the payment services. No additional installation required.

```javascript
const { EmailService } = require('../services/payment');
const emailService = new EmailService();
```

## Configuration

Email configuration is handled through environment variables in `.env`:

```bash
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=noreply@skilldad.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM=noreply@skilldad.com

# Company Information (optional - defaults provided)
COMPANY_GSTIN=29ABCDE1234F1Z5
COMPANY_ADDRESS=SkillDad Learning Pvt Ltd, Bangalore, India
WEBSITE_URL=https://skilldad.com
SUPPORT_URL=https://skilldad.com/support
TERMS_URL=https://skilldad.com/terms
PRIVACY_URL=https://skilldad.com/privacy
```

## Email Templates

Templates are located in `server/templates/emails/`:

- `payment-success.html` - Payment confirmation template
- `payment-failure.html` - Payment failure notification template
- `refund-confirmation.html` - Refund confirmation template
- `reconciliation-summary.html` - Daily reconciliation summary template

Templates use a simple variable replacement syntax:
- `{{variable}}` - Simple variable replacement
- `{{#if variable}}...{{/if}}` - Conditional blocks
- `{{#each array}}...{{/each}}` - Array iteration

## Usage Examples

### 1. Send Payment Confirmation Email

```javascript
const { EmailService } = require('../services/payment');
const emailService = new EmailService();

// After successful payment
const transaction = await Transaction.findOne({ transactionId: 'TXN_123' });
const student = await User.findById(transaction.student);
const course = await Course.findById(transaction.course);

// With receipt attachment
const receiptPath = '/path/to/receipt.pdf';
await emailService.sendPaymentConfirmation(
  transaction,
  student,
  course,
  receiptPath
);

// Without receipt attachment
await emailService.sendPaymentConfirmation(
  transaction,
  student,
  course
);
```

### 2. Send Payment Failure Email

```javascript
// After payment failure
const transaction = await Transaction.findOne({ 
  transactionId: 'TXN_123',
  status: 'failed'
});
const student = await User.findById(transaction.student);
const course = await Course.findById(transaction.course);

await emailService.sendPaymentFailure(
  transaction,
  student,
  course
);
```

### 3. Send Refund Confirmation Email

```javascript
// After refund is processed
const transaction = await Transaction.findOne({ 
  transactionId: 'TXN_123',
  status: 'refunded'
});
const student = await User.findById(transaction.student);
const course = await Course.findById(transaction.course);

await emailService.sendRefundConfirmation(
  transaction,
  student,
  course
);
```

### 4. Send Reconciliation Summary Email

```javascript
// Daily automated reconciliation
const reconciliation = await Reconciliation.findOne({ 
  reconciliationDate: new Date()
});

const financeEmails = [
  'finance@skilldad.com',
  'accounts@skilldad.com',
  'cfo@skilldad.com'
];

await emailService.sendReconciliationSummary(
  reconciliation,
  financeEmails
);
```

## Integration with Payment Controller

### In Payment Callback Handler

```javascript
async handleCallback(req, res) {
  // ... verify signature and update transaction ...
  
  if (transaction.status === 'success') {
    // Generate receipt
    const receiptPath = await receiptGenerator.generateReceipt(transaction._id);
    
    // Send confirmation email with receipt
    const emailService = new EmailService();
    await emailService.sendPaymentConfirmation(
      transaction,
      student,
      course,
      receiptPath
    );
  } else if (transaction.status === 'failed') {
    // Send failure notification
    const emailService = new EmailService();
    await emailService.sendPaymentFailure(
      transaction,
      student,
      course
    );
  }
}
```

### In Refund Processing

```javascript
async processRefund(req, res) {
  // ... process refund with HDFC gateway ...
  
  if (refundSuccessful) {
    // Update transaction status
    transaction.status = 'refunded';
    await transaction.save();
    
    // Send refund confirmation
    const emailService = new EmailService();
    await emailService.sendRefundConfirmation(
      transaction,
      student,
      course
    );
  }
}
```

### In Daily Reconciliation Job

```javascript
// Scheduled job (runs daily at 2 AM)
async function dailyReconciliation() {
  const reconciliationService = new ReconciliationService();
  const emailService = new EmailService();
  
  // Run reconciliation
  const reconciliation = await reconciliationService.reconcileTransactions(
    new Date()
  );
  
  // Send summary to finance team
  const financeEmails = await getFinanceTeamEmails();
  await emailService.sendReconciliationSummary(
    reconciliation,
    financeEmails
  );
}
```

## Error Handling

The EmailService includes comprehensive error handling:

```javascript
try {
  await emailService.sendPaymentConfirmation(transaction, student, course);
} catch (error) {
  console.error('Failed to send payment confirmation email:', error);
  // Email failure should not block payment processing
  // Log error and continue
}
```

**Important**: Email sending failures should be logged but should NOT block payment processing. The payment transaction should complete successfully even if the email fails to send.

## Testing

### Manual Testing

Run the manual test script:

```bash
node server/services/payment/test-email-manual.js
```

This will:
1. Load and validate all email templates
2. Test template rendering with mock data
3. Validate email structure for all email types
4. Show formatted output without actually sending emails

### Sending Test Emails

To actually send test emails:

1. Configure email settings in `.env`
2. Edit `test-email-manual.js` and update `mockStudent.email` to your email
3. Uncomment the `sendEmail` calls in the test file
4. Run the test script

### Unit Testing

```javascript
const EmailService = require('./EmailService');

describe('EmailService', () => {
  let emailService;
  
  beforeEach(() => {
    emailService = new EmailService();
  });
  
  test('should format transaction data correctly', () => {
    const transaction = {
      transactionId: 'TXN_123',
      finalAmount: mongoose.Types.Decimal128.fromString('8000.00'),
      paymentMethod: 'credit_card',
    };
    
    const formatted = emailService.formatTransactionData(transaction);
    expect(formatted.transactionId).toBe('TXN_123');
    expect(formatted.finalAmount).toBe('8000.00');
    expect(formatted.paymentMethod).toBe('Credit Card');
  });
  
  test('should load email template', async () => {
    const template = await emailService.loadTemplate('payment-success');
    expect(template).toContain('Payment Successful');
  });
});
```

## Template Customization

To customize email templates:

1. Edit the HTML files in `server/templates/emails/`
2. Use the template variable syntax: `{{variableName}}`
3. Test changes using the manual test script
4. Ensure all required variables are provided in the service methods

### Available Template Variables

#### Payment Success Template
- `studentName`, `courseTitle`, `transactionId`, `transactionDate`
- `paymentMethod`, `cardLast4`, `originalAmount`, `discountAmount`
- `finalAmount`, `gstAmount`, `discountCode`, `discountApplied`
- `receiptNumber`, `receiptDownloadUrl`, `courseAccessUrl`
- Company info: `companyGSTIN`, `companyAddress`, `websiteUrl`, etc.

#### Payment Failure Template
- `studentName`, `courseTitle`, `transactionId`, `transactionDate`
- `errorMessage`, `retriesRemaining`, `retryPaymentUrl`
- `finalAmount`, `paymentMethod`

#### Refund Confirmation Template
- `studentName`, `courseTitle`, `refundTransactionId`, `originalTransactionId`
- `originalPaymentDate`, `refundProcessedDate`, `expectedRefundDate`
- `refundAmount`, `refundType`, `paymentMethod`, `cardLast4`

#### Reconciliation Summary Template
- `reconciliationId`, `reconciliationDate`, `startDate`, `endDate`
- `totalTransactions`, `matchedTransactions`, `unmatchedTransactions`
- `discrepancyCount`, `totalAmount`, `settledAmount`, `pendingAmount`
- `hasDiscrepancies`, `discrepancies` (array), `reconciliationStatus`

## Performance Considerations

1. **Async Operations**: All email sending is asynchronous and non-blocking
2. **Error Isolation**: Email failures don't affect payment processing
3. **Template Caching**: Consider caching templates in production for better performance
4. **Batch Sending**: Reconciliation emails are sent in parallel using `Promise.all()`

## Security Considerations

1. **Email Configuration**: Store credentials in environment variables, never in code
2. **Data Sanitization**: All user data is properly escaped in templates
3. **PCI Compliance**: Only last 4 digits of card numbers are included in emails
4. **Sensitive Data**: CVV, PIN, and full card numbers are never included in emails

## Troubleshooting

### Email Not Sending

1. Check email configuration in `.env`
2. Verify SMTP credentials are correct
3. Check if email service is blocked by firewall
4. Review console logs for error messages

### Template Not Found

1. Verify template file exists in `server/templates/emails/`
2. Check file name matches exactly (case-sensitive)
3. Ensure file has `.html` extension

### Variables Not Rendering

1. Check variable names match exactly in template and data
2. Verify data is being passed to the email method
3. Use the test script to debug template rendering

## Support

For issues or questions:
- Check the test script: `server/services/payment/test-email-manual.js`
- Review email templates: `server/templates/emails/`
- Contact: dev-team@skilldad.com
