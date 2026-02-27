# Security and Compliance Services Usage Guide

This document provides usage examples for the SecurityLogger and PCIComplianceService classes.

## SecurityLogger

The SecurityLogger service handles audit logging for all payment operations, implementing requirements 5.8, 5.9, and 14.5.

### Import

```javascript
const SecurityLogger = require('./services/payment/SecurityLogger');
// or
const { SecurityLogger } = require('./services/payment');
```

### Log Payment Attempt

```javascript
// Log when a payment is initiated
await SecurityLogger.logPaymentAttempt(
  'TXN_1234567890',           // transactionId
  '507f1f77bcf86cd799439011', // userId
  '192.168.1.1',              // ipAddress
  'Mozilla/5.0...',           // userAgent
  {                           // additionalDetails (optional)
    courseId: '507f1f77bcf86cd799439012',
    amount: 9440.00,
    paymentMethod: 'credit_card'
  }
);
```

### Log Signature Failure (Security Alert)

```javascript
// Log when signature verification fails
await SecurityLogger.logSignatureFailure(
  '/api/payment/webhook',     // endpoint
  {                           // data (will be masked)
    transactionId: 'TXN_1234567890',
    signature: 'invalid_signature',
    // Any sensitive data will be automatically masked
  },
  '192.168.1.1',              // ipAddress
  'Webhook signature verification failed' // description (optional)
);
```

### Log Refund Operation

```javascript
// Log when a refund is processed
await SecurityLogger.logRefundOperation(
  'TXN_1234567890',           // transactionId
  '507f1f77bcf86cd799439011', // adminId
  9440.00,                    // amount
  'Customer requested refund due to course cancellation', // reason
  {                           // additionalDetails (optional)
    refundTransactionId: 'RFD_1234567890',
    refundMethod: 'original_payment_method'
  }
);
```

### Log Payment Success

```javascript
await SecurityLogger.logPaymentSuccess(
  'TXN_1234567890',
  '507f1f77bcf86cd799439011',
  {
    amount: 9440.00,
    paymentMethod: 'credit_card',
    gatewayTransactionId: 'HDFC_987654321'
  }
);
```

### Log Payment Failure

```javascript
await SecurityLogger.logPaymentFailure(
  'TXN_1234567890',
  '507f1f77bcf86cd799439011',
  'INSUFFICIENT_FUNDS',
  'Payment declined due to insufficient funds',
  {
    attemptNumber: 1,
    paymentMethod: 'credit_card'
  }
);
```

### Mask Sensitive Data

```javascript
// Manually mask sensitive data before logging
const maskedData = SecurityLogger.maskSensitiveData({
  cardNumber: '4111111111111234',
  cvv: '123',
  amount: 9440.00,
  customerName: 'John Doe'
});

// Result:
// {
//   cardNumber: '****1234',
//   // cvv is removed
//   amount: 9440.00,
//   customerName: 'John Doe'
// }
```

### Get Transaction Logs

```javascript
// Get all audit logs for a specific transaction
const logs = await SecurityLogger.getTransactionLogs('TXN_1234567890');

console.log(logs);
// [
//   { event: 'payment_attempt', timestamp: '2024-01-15T10:20:00Z', ... },
//   { event: 'payment_success', timestamp: '2024-01-15T10:25:30Z', ... }
// ]
```

### Get User Logs

```javascript
// Get audit logs for a specific user
const result = await SecurityLogger.getUserLogs(
  '507f1f77bcf86cd799439011',
  {
    limit: 50,
    skip: 0,
    startDate: '2024-01-01',
    endDate: '2024-01-31'
  }
);

console.log(result.logs);
console.log(result.pagination);
```

### Get Security Alerts

```javascript
// Get security alerts with filters
const result = await SecurityLogger.getSecurityAlerts(
  {
    severity: 'high',
    status: 'open',
    startDate: '2024-01-01',
    endDate: '2024-01-31'
  },
  {
    limit: 50,
    skip: 0
  }
);

console.log(result.alerts);
console.log(result.pagination);
```

---

## PCIComplianceService

The PCIComplianceService ensures PCI-DSS compliance for payment operations, implementing requirements 14.1, 14.2, and 14.4.

### Import

```javascript
const PCIComplianceService = require('./services/payment/PCIComplianceService');
// or
const { PCIComplianceService } = require('./services/payment');
```

### Validate Card Data Not Stored

```javascript
// Validate that no forbidden card data is being stored
try {
  const data = {
    transactionId: 'TXN_1234567890',
    amount: 9440.00,
    cardLast4: '1234', // OK - only last 4 digits
    // cardNumber: '4111111111111234', // NOT OK - would throw error
    // cvv: '123', // NOT OK - would throw error
  };
  
  PCIComplianceService.validateCardDataNotStored(data);
  console.log('Data is PCI-DSS compliant');
} catch (error) {
  console.error('PCI-DSS violation:', error.message);
  // Handle the violation - don't store the data
}
```

### Mask Card Number

```javascript
// Mask a card number to show only last 4 digits
const masked = PCIComplianceService.maskCardNumber('4111111111111234');
console.log(masked); // '****1234'

// Works with various formats
console.log(PCIComplianceService.maskCardNumber('4111-1111-1111-1234')); // '****1234'
console.log(PCIComplianceService.maskCardNumber('4111 1111 1111 1234')); // '****1234'
```

### Enforce Access Control

```javascript
// Check if user has permission for an operation
try {
  await PCIComplianceService.enforceAccessControl(
    '507f1f77bcf86cd799439011', // userId
    'process_refund'             // operation
  );
  
  // User has permission, proceed with operation
  console.log('Access granted');
} catch (error) {
  console.error('Access denied:', error.message);
  // Return 403 Forbidden
}
```

### Available Operations

```javascript
// Payment operations
'initiate_payment'        // student, admin, finance
'view_payment'            // student, admin, finance
'view_own_payments'       // all roles

// Refund operations
'process_refund'          // admin, finance
'approve_refund'          // admin only
'view_refunds'            // admin, finance

// Transaction operations
'view_all_transactions'   // admin, finance
'view_transaction_details' // admin, finance

// Configuration operations
'configure_gateway'       // admin only
'update_gateway_config'   // admin only
'view_gateway_config'     // admin, finance

// Reconciliation operations
'run_reconciliation'      // finance, admin
'view_reconciliation'     // finance, admin
'resolve_discrepancy'     // finance, admin

// Monitoring operations
'view_metrics'            // admin, finance
'view_audit_logs'         // admin, finance
'view_security_alerts'    // admin only

// Receipt operations
'generate_receipt'        // student, admin, finance
'download_receipt'        // student, admin, finance
```

### Validate Two-Factor Authentication

```javascript
// Validate 2FA code for refund operations
try {
  await PCIComplianceService.validateTwoFactorAuth(
    '507f1f77bcf86cd799439011', // userId
    '123456'                     // twoFactorCode
  );
  
  // 2FA validated, proceed with refund
  console.log('2FA validated');
} catch (error) {
  console.error('2FA validation failed:', error.message);
  // Return error to user
}
```

### Sanitize Payment Data

```javascript
// Remove all forbidden fields from payment data
const rawData = {
  transactionId: 'TXN_1234567890',
  amount: 9440.00,
  cardNumber: '4111111111111234', // Will be removed
  cvv: '123',                     // Will be removed
  cardLast4: '1234',              // Will be kept
  customerName: 'John Doe'        // Will be kept
};

const sanitized = PCIComplianceService.sanitizePaymentData(rawData);

console.log(sanitized);
// {
//   transactionId: 'TXN_1234567890',
//   amount: 9440.00,
//   cardLast4: '1234',
//   customerName: 'John Doe'
// }
```

### Validate Card Last 4 Digits

```javascript
// Validate that only last 4 digits are stored
try {
  PCIComplianceService.validateCardLast4('1234'); // OK
  PCIComplianceService.validateCardLast4('12345'); // Throws error
} catch (error) {
  console.error('Invalid card last 4:', error.message);
}
```

### Check for Forbidden Data

```javascript
// Check if data contains forbidden fields
const data = {
  transactionId: 'TXN_1234567890',
  cardNumber: '4111111111111234',
  amount: 9440.00
};

const result = PCIComplianceService.checkForForbiddenData(data);

console.log(result);
// {
//   hasForbiddenData: true,
//   forbiddenFields: ['cardNumber']
// }
```

### Get Compliance Status

```javascript
// Get current compliance status
const status = PCIComplianceService.getComplianceStatus();

console.log(status);
// {
//   pciDssVersion: '3.2.1',
//   complianceLevel: 'Level 1',
//   requirements: {
//     '14.1': { description: '...', status: 'implemented', method: '...' },
//     '14.2': { description: '...', status: 'implemented', method: '...' },
//     ...
//   }
// }
```

---

## Integration Example

Here's a complete example of using both services in a payment controller:

```javascript
const SecurityLogger = require('./services/payment/SecurityLogger');
const PCIComplianceService = require('./services/payment/PCIComplianceService');

// Payment initiation endpoint
async function initiatePayment(req, res) {
  try {
    const { courseId, discountCode } = req.body;
    const userId = req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');
    
    // Enforce access control
    await PCIComplianceService.enforceAccessControl(userId, 'initiate_payment');
    
    // Create transaction
    const transaction = await createTransaction(courseId, userId, discountCode);
    
    // Log payment attempt
    await SecurityLogger.logPaymentAttempt(
      transaction.transactionId,
      userId,
      ipAddress,
      userAgent,
      {
        courseId,
        amount: transaction.finalAmount,
        discountCode
      }
    );
    
    // Generate payment URL
    const paymentUrl = await generatePaymentUrl(transaction);
    
    res.json({
      success: true,
      transactionId: transaction.transactionId,
      paymentUrl
    });
  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Refund processing endpoint
async function processRefund(req, res) {
  try {
    const { transactionId, amount, reason, twoFactorCode } = req.body;
    const adminId = req.user.id;
    
    // Enforce access control
    await PCIComplianceService.enforceAccessControl(adminId, 'process_refund');
    
    // Validate 2FA
    await PCIComplianceService.validateTwoFactorAuth(adminId, twoFactorCode);
    
    // Process refund
    const refund = await processRefundOperation(transactionId, amount);
    
    // Log refund operation
    await SecurityLogger.logRefundOperation(
      transactionId,
      adminId,
      amount,
      reason,
      {
        refundTransactionId: refund.refundTransactionId
      }
    );
    
    res.json({
      success: true,
      refundTransactionId: refund.refundTransactionId
    });
  } catch (error) {
    console.error('Refund processing error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Webhook endpoint
async function handleWebhook(req, res) {
  try {
    const webhookData = req.body;
    const ipAddress = req.ip;
    
    // Verify signature
    const isValid = verifyWebhookSignature(webhookData);
    
    if (!isValid) {
      // Log signature failure
      await SecurityLogger.logSignatureFailure(
        '/api/payment/webhook',
        webhookData,
        ipAddress,
        'Webhook signature verification failed'
      );
      
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
    
    // Sanitize data before storage
    const sanitizedData = PCIComplianceService.sanitizePaymentData(webhookData);
    
    // Validate no forbidden data
    PCIComplianceService.validateCardDataNotStored(sanitizedData);
    
    // Process webhook
    await processWebhookData(sanitizedData);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}
```

---

## Best Practices

1. **Always log payment operations**: Use SecurityLogger for all payment-related operations
2. **Validate before storage**: Always use `validateCardDataNotStored()` before saving payment data
3. **Mask sensitive data**: Use `maskSensitiveData()` or `maskCardNumber()` for any logging or display
4. **Enforce access control**: Check permissions using `enforceAccessControl()` before sensitive operations
5. **Require 2FA for refunds**: Always validate 2FA for refund operations
6. **Sanitize webhook data**: Use `sanitizePaymentData()` for all external data before storage
7. **Monitor security alerts**: Regularly check security alerts for suspicious activity
8. **Review audit logs**: Periodically review audit logs for compliance and security

---

## Compliance Notes

- **Audit Log Retention**: Logs are automatically retained for 7 years as per requirement 14.5
- **PCI-DSS Compliance**: All services implement PCI-DSS requirements 14.1, 14.2, and 14.4
- **Data Masking**: Sensitive data is automatically masked in all logs per requirement 5.9
- **Access Control**: Role-based access control is enforced for all sensitive operations
- **Security Alerts**: High-severity security events trigger automatic alerts to administrators

---

## Testing

See the test files for comprehensive examples:
- `SecurityLogger.test.js` - Unit tests for SecurityLogger
- `PCIComplianceService.test.js` - Unit tests for PCIComplianceService
