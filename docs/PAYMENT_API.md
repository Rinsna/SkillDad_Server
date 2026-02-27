# HDFC SmartGateway Payment API Documentation

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Error Codes](#error-codes)
5. [Student Payment Endpoints](#student-payment-endpoints)
6. [Admin Payment Endpoints](#admin-payment-endpoints)
7. [Reconciliation Endpoints](#reconciliation-endpoints)
8. [Monitoring Endpoints](#monitoring-endpoints)
9. [Webhook Integration](#webhook-integration)
10. [Security](#security)

---

## Overview

The HDFC SmartGateway Payment API enables secure online payments for course enrollments on the SkillDad platform. The API supports multiple payment methods including Credit/Debit cards, Net Banking, UPI, and digital wallets.

**Base URL**: `https://skilldad.com/api`

**API Version**: v1

**Supported Payment Methods**:
- Credit Cards (Visa, Mastercard, RuPay)
- Debit Cards (Visa, Mastercard, RuPay, Maestro)
- Net Banking (Major Indian banks)
- UPI (Google Pay, PhonePe, Paytm, etc.)
- Digital Wallets (Paytm, PhonePe, Google Pay)

**Currency**: INR (Indian Rupees)

**Transaction Limits**:
- Minimum: ₹10.00
- Maximum: ₹500,000.00

---

## Authentication

### JWT Authentication

Most endpoints require JWT (JSON Web Token) authentication. Include the token in the Authorization header:

```http
Authorization: Bearer <your_jwt_token>
```

**Token Acquisition**: Obtain JWT token through the user login endpoint (`POST /api/auth/login`).

**Token Expiration**: Tokens expire after 24 hours. Refresh tokens are valid for 30 days.


### Admin Authentication

Admin endpoints require:
1. **JWT Token** with admin or finance role
2. **Two-Factor Authentication (2FA)** for sensitive operations (refunds)

**Admin Roles**:
- `admin`: Full access to payment configuration and monitoring
- `finance`: Access to reconciliation and refund operations
- `student`: Access to own payment history and transactions

### Signature Verification

Callbacks and webhooks from HDFC Gateway are authenticated using HMAC-SHA256 signatures. The signature is verified server-side automatically.

---

## Rate Limiting

Rate limits are enforced per user/IP address to prevent abuse. Limits are tracked using Redis.

| Endpoint | Rate Limit | Window | Key |
|----------|------------|--------|-----|
| `POST /api/payment/initiate` | 5 requests | 1 minute | User ID |
| `POST /api/payment/retry/:id` | 3 requests | 1 hour | Transaction ID |
| `GET /api/payment/status/:id` | 10 requests | 1 minute | User ID |
| `GET /api/payment/history` | 10 requests | 1 minute | User ID |
| `GET /api/payment/receipt/:id` | 10 requests | 1 minute | User ID |
| `POST /api/admin/payment/refund` | 10 requests | 1 hour | Admin ID |
| `GET /api/admin/payment/config` | 20 requests | 1 minute | Admin ID |
| `PUT /api/admin/payment/config` | 5 requests | 1 minute | Admin ID |
| `POST /api/admin/payment/test-connection` | 5 requests | 1 minute | Admin ID |
| `POST /api/admin/reconciliation/run` | 10 requests | 1 day | Admin ID |
| `GET /api/admin/reconciliation/:id` | 20 requests | 1 minute | Admin ID |
| `POST /api/admin/reconciliation/resolve` | 20 requests | 1 minute | Admin ID |
| `GET /api/admin/monitoring/metrics` | 20 requests | 1 minute | Admin ID |
| `GET /api/admin/monitoring/health` | 20 requests | 1 minute | Admin ID |

**Rate Limit Headers**:
```http
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1642345678
```

**Rate Limit Exceeded Response**:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": 45
  }
}
```


---

## Error Codes

All error responses follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

### HTTP Status Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid or missing authentication |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 502 | Bad Gateway - Payment gateway error |
| 503 | Service Unavailable - Gateway maintenance |

### Payment Error Codes

| Error Code | Description | HTTP Status | Retry Possible |
|------------|-------------|-------------|----------------|
| `INVALID_COURSE_ID` | Course ID is invalid or doesn't exist | 400 | No |
| `INVALID_DISCOUNT_CODE` | Discount code is invalid or expired | 400 | No |
| `ENROLLMENT_EXISTS` | Active enrollment already exists for this course | 409 | No |
| `AMOUNT_BELOW_MINIMUM` | Payment amount is below minimum limit (₹10) | 400 | No |
| `AMOUNT_ABOVE_MAXIMUM` | Payment amount exceeds maximum limit (₹500,000) | 400 | No |
| `SESSION_EXPIRED` | Payment session has expired (15 minutes) | 400 | Yes |
| `INVALID_TRANSACTION_ID` | Transaction ID format is invalid | 400 | No |
| `TRANSACTION_NOT_FOUND` | Transaction doesn't exist | 404 | No |
| `PAYMENT_ALREADY_SUCCESSFUL` | Payment has already been completed | 409 | No |
| `PAYMENT_ALREADY_REFUNDED` | Transaction has already been refunded | 409 | No |
| `RETRY_LIMIT_EXCEEDED` | Maximum retry attempts (3) exceeded | 400 | No |
| `SIGNATURE_VERIFICATION_FAILED` | Payment gateway signature is invalid | 401 | No |
| `GATEWAY_TIMEOUT` | Payment gateway did not respond in time | 504 | Yes |
| `GATEWAY_UNAVAILABLE` | Payment gateway is under maintenance | 503 | Yes |
| `INSUFFICIENT_FUNDS` | Insufficient funds in payment account | 400 | Yes |
| `CARD_DECLINED` | Card was declined by issuing bank | 400 | Yes |
| `CARD_EXPIRED` | Card has expired | 400 | No |
| `INVALID_CVV` | CVV verification failed | 400 | Yes |
| `NETWORK_ERROR` | Network error during payment processing | 500 | Yes |
| `REFUND_AMOUNT_EXCEEDS_ORIGINAL` | Refund amount exceeds original payment | 400 | No |
| `REFUND_NOT_ELIGIBLE` | Transaction is not eligible for refund | 400 | No |
| `TWO_FACTOR_AUTH_REQUIRED` | 2FA verification required for this operation | 403 | No |
| `TWO_FACTOR_AUTH_FAILED` | 2FA code is invalid or expired | 401 | Yes |
| `UNAUTHORIZED_ACCESS` | User doesn't have permission for this resource | 403 | No |
| `RATE_LIMIT_EXCEEDED` | Too many requests, rate limit exceeded | 429 | Yes |


---

## Student Payment Endpoints

### 1. Initiate Payment

Creates a new payment session and redirects the student to HDFC SmartGateway for payment processing.

**Endpoint**: `POST /api/payment/initiate`

**Authentication**: Required (JWT)

**Rate Limit**: 5 requests per minute

**CSRF Protection**: Required

**Request Headers**:
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
X-CSRF-Token: <csrf_token>
```

**Request Body**:
```json
{
  "courseId": "507f1f77bcf86cd799439011",
  "discountCode": "PARTNER20"
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `courseId` | String (MongoDB ObjectId) | Yes | ID of the course to enroll in |
| `discountCode` | String (4-20 alphanumeric) | No | Promotional discount code |

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "transactionId": "TXN_A1B2C3D4E5",
    "sessionId": "SES_F6G7H8I9J0",
    "paymentUrl": "https://smartgateway.hdfcbank.com/pay?session=...",
    "expiresAt": "2024-01-15T10:30:00Z",
    "amount": {
      "original": 10000.00,
      "discount": 2000.00,
      "subtotal": 8000.00,
      "gst": 1440.00,
      "total": 9440.00,
      "currency": "INR"
    },
    "course": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Full Stack Development Bootcamp",
      "instructor": "John Doe"
    }
  }
}
```

**Error Responses**:

400 Bad Request - Invalid course ID:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_COURSE_ID",
    "message": "The specified course ID is invalid or doesn't exist"
  }
}
```

400 Bad Request - Invalid discount code:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_DISCOUNT_CODE",
    "message": "The discount code is invalid or has expired"
  }
}
```

409 Conflict - Enrollment exists:
```json
{
  "success": false,
  "error": {
    "code": "ENROLLMENT_EXISTS",
    "message": "You already have an active enrollment for this course"
  }
}
```

**Usage Example**:
```javascript
// Get CSRF token first
const csrfResponse = await fetch('/api/payment/csrf-token', {
  credentials: 'include'
});
const { csrfToken } = await csrfResponse.json();

// Initiate payment
const response = await fetch('/api/payment/initiate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify({
    courseId: '507f1f77bcf86cd799439011',
    discountCode: 'PARTNER20'
  })
});

const data = await response.json();
if (data.success) {
  // Redirect to payment gateway
  window.location.href = data.data.paymentUrl;
}
```


---

### 2. Payment Callback

Handles the redirect from HDFC Gateway after payment completion. This endpoint is called automatically by the gateway.

**Endpoint**: `GET /api/payment/callback`

**Authentication**: Signature verification (automatic)

**Rate Limit**: None

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `transactionId` | String | Yes | Transaction ID from initiate payment |
| `status` | String | Yes | Payment status (success/failed) |
| `gatewayTransactionId` | String | Yes | HDFC Gateway transaction ID |
| `signature` | String | Yes | HMAC-SHA256 signature for verification |
| `errorCode` | String | No | Error code if payment failed |
| `errorMessage` | String | No | Error message if payment failed |

**Response**: HTML page with payment confirmation or error message

**Success Page** (status=success):
- Transaction details (ID, amount, date)
- Course enrollment confirmation
- Receipt download link
- Email confirmation notice

**Failure Page** (status=failed):
- Error message with reason
- Retry button (if retry attempts < 3)
- Contact support link
- Transaction ID for reference

**Example Callback URL**:
```
https://skilldad.com/api/payment/callback?transactionId=TXN_A1B2C3D4E5&status=success&gatewayTransactionId=HDFC_987654321&signature=abc123def456...
```

---

### 3. Check Payment Status

Queries the real-time payment status from HDFC Gateway and returns current transaction details.

**Endpoint**: `GET /api/payment/status/:transactionId`

**Authentication**: Required (JWT)

**Rate Limit**: 10 requests per minute

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `transactionId` | String | Yes | Transaction ID (format: TXN_XXXXXXXXXX) |

**Request Headers**:
```http
Authorization: Bearer <jwt_token>
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "transactionId": "TXN_A1B2C3D4E5",
    "status": "success",
    "amount": 9440.00,
    "currency": "INR",
    "course": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Full Stack Development Bootcamp"
    },
    "paymentMethod": "credit_card",
    "paymentMethodDetails": {
      "cardType": "Visa",
      "cardLast4": "1234"
    },
    "initiatedAt": "2024-01-15T10:20:00Z",
    "completedAt": "2024-01-15T10:25:30Z",
    "receiptUrl": "https://skilldad.com/receipts/TXN_A1B2C3D4E5.pdf",
    "receiptNumber": "RCP-2024-001234"
  }
}
```

**Error Responses**:

400 Bad Request - Invalid transaction ID format:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TRANSACTION_ID",
    "message": "Transaction ID format is invalid. Expected format: TXN_XXXXXXXXXX"
  }
}
```

404 Not Found - Transaction doesn't exist:
```json
{
  "success": false,
  "error": {
    "code": "TRANSACTION_NOT_FOUND",
    "message": "No transaction found with the specified ID"
  }
}
```

**Usage Example**:
```javascript
const response = await fetch(`/api/payment/status/${transactionId}`, {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

const data = await response.json();
console.log('Payment status:', data.data.status);
```


---

### 4. Get Payment History

Retrieves the payment history for the authenticated student with pagination and filtering.

**Endpoint**: `GET /api/payment/history`

**Authentication**: Required (JWT)

**Rate Limit**: 10 requests per minute

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | Integer | No | 1 | Page number (1-indexed) |
| `limit` | Integer | No | 10 | Items per page (max: 50) |
| `status` | String | No | all | Filter by status: all, success, failed, pending, refunded |

**Request Headers**:
```http
Authorization: Bearer <jwt_token>
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "transactionId": "TXN_A1B2C3D4E5",
        "course": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Full Stack Development Bootcamp",
          "thumbnail": "https://cdn.skilldad.com/courses/fullstack.jpg"
        },
        "amount": 9440.00,
        "currency": "INR",
        "status": "success",
        "paymentMethod": "credit_card",
        "initiatedAt": "2024-01-15T10:20:00Z",
        "completedAt": "2024-01-15T10:25:30Z",
        "receiptUrl": "https://skilldad.com/receipts/TXN_A1B2C3D4E5.pdf"
      },
      {
        "transactionId": "TXN_B2C3D4E5F6",
        "course": {
          "id": "507f1f77bcf86cd799439012",
          "title": "Data Science with Python",
          "thumbnail": "https://cdn.skilldad.com/courses/datascience.jpg"
        },
        "amount": 12000.00,
        "currency": "INR",
        "status": "failed",
        "paymentMethod": "upi",
        "errorMessage": "Insufficient funds",
        "initiatedAt": "2024-01-10T14:30:00Z",
        "canRetry": true,
        "retryCount": 1
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalItems": 25,
      "itemsPerPage": 10,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

**Usage Example**:
```javascript
// Get first page of successful payments
const response = await fetch('/api/payment/history?page=1&limit=10&status=success', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

const data = await response.json();
data.data.transactions.forEach(txn => {
  console.log(`${txn.course.title}: ₹${txn.amount} - ${txn.status}`);
});
```

---

### 5. Download Receipt

Downloads the payment receipt PDF for a successful transaction.

**Endpoint**: `GET /api/payment/receipt/:transactionId`

**Authentication**: Required (JWT)

**Rate Limit**: 10 requests per minute

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `transactionId` | String | Yes | Transaction ID |

**Request Headers**:
```http
Authorization: Bearer <jwt_token>
```

**Success Response** (200 OK):
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="receipt-TXN_A1B2C3D4E5.pdf"`
- PDF file download

**Error Responses**:

404 Not Found - Transaction doesn't exist:
```json
{
  "success": false,
  "error": {
    "code": "TRANSACTION_NOT_FOUND",
    "message": "No transaction found with the specified ID"
  }
}
```

400 Bad Request - Receipt not available:
```json
{
  "success": false,
  "error": {
    "code": "RECEIPT_NOT_AVAILABLE",
    "message": "Receipt is only available for successful payments"
  }
}
```

**Usage Example**:
```javascript
// Download receipt
window.location.href = `/api/payment/receipt/${transactionId}?token=${jwtToken}`;

// Or fetch and display
const response = await fetch(`/api/payment/receipt/${transactionId}`, {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
window.open(url);
```


---

### 6. Retry Failed Payment

Creates a new payment session for a failed transaction, allowing the student to retry payment.

**Endpoint**: `POST /api/payment/retry/:transactionId`

**Authentication**: Required (JWT)

**Rate Limit**: 3 requests per hour per transaction

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `transactionId` | String | Yes | Original failed transaction ID |

**Request Headers**:
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "newTransactionId": "TXN_C3D4E5F6G7",
    "originalTransactionId": "TXN_B2C3D4E5F6",
    "paymentUrl": "https://smartgateway.hdfcbank.com/pay?session=...",
    "expiresAt": "2024-01-15T11:00:00Z",
    "retryCount": 2,
    "maxRetries": 3,
    "amount": {
      "total": 9440.00,
      "currency": "INR"
    }
  }
}
```

**Error Responses**:

400 Bad Request - Retry limit exceeded:
```json
{
  "success": false,
  "error": {
    "code": "RETRY_LIMIT_EXCEEDED",
    "message": "Maximum retry attempts (3) exceeded. Please create a new payment session.",
    "details": {
      "retryCount": 3,
      "maxRetries": 3
    }
  }
}
```

409 Conflict - Payment already successful:
```json
{
  "success": false,
  "error": {
    "code": "PAYMENT_ALREADY_SUCCESSFUL",
    "message": "This payment has already been completed successfully"
  }
}
```

**Usage Example**:
```javascript
const response = await fetch(`/api/payment/retry/${transactionId}`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
if (data.success) {
  // Redirect to new payment URL
  window.location.href = data.data.paymentUrl;
}
```


---

## Admin Payment Endpoints

### 1. Process Refund

Initiates a refund for a successful payment transaction. Requires admin or finance role and 2FA verification.

**Endpoint**: `POST /api/admin/payment/refund`

**Authentication**: Required (Admin/Finance role + 2FA)

**Rate Limit**: 10 requests per hour

**Request Headers**:
```http
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "transactionId": "TXN_A1B2C3D4E5",
  "amount": 9440.00,
  "reason": "Course cancellation requested by student",
  "twoFactorCode": "123456"
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `transactionId` | String | Yes | Transaction ID to refund |
| `amount` | Number | Yes | Refund amount (must not exceed original amount) |
| `reason` | String | Yes | Reason for refund (10-500 characters) |
| `twoFactorCode` | String | Yes | 6-digit 2FA verification code |

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "refundTransactionId": "RFD_A1B2C3D4E5",
    "originalTransactionId": "TXN_A1B2C3D4E5",
    "status": "processing",
    "amount": 9440.00,
    "currency": "INR",
    "estimatedCompletionDate": "2024-01-22T00:00:00Z",
    "refundMethod": "original_payment_method",
    "processedBy": {
      "id": "507f1f77bcf86cd799439013",
      "name": "Admin User",
      "email": "admin@skilldad.com"
    },
    "processedAt": "2024-01-15T10:30:00Z"
  }
}
```

**Error Responses**:

403 Forbidden - 2FA required:
```json
{
  "success": false,
  "error": {
    "code": "TWO_FACTOR_AUTH_REQUIRED",
    "message": "Two-factor authentication is required for refund operations"
  }
}
```

401 Unauthorized - Invalid 2FA code:
```json
{
  "success": false,
  "error": {
    "code": "TWO_FACTOR_AUTH_FAILED",
    "message": "The 2FA code is invalid or has expired"
  }
}
```

400 Bad Request - Refund amount exceeds original:
```json
{
  "success": false,
  "error": {
    "code": "REFUND_AMOUNT_EXCEEDS_ORIGINAL",
    "message": "Refund amount (₹10,000) exceeds original payment amount (₹9,440)",
    "details": {
      "requestedAmount": 10000.00,
      "originalAmount": 9440.00,
      "maxRefundAmount": 9440.00
    }
  }
}
```

409 Conflict - Already refunded:
```json
{
  "success": false,
  "error": {
    "code": "PAYMENT_ALREADY_REFUNDED",
    "message": "This transaction has already been refunded",
    "details": {
      "refundTransactionId": "RFD_A1B2C3D4E5",
      "refundedAt": "2024-01-10T15:30:00Z",
      "refundAmount": 9440.00
    }
  }
}
```

**Usage Example**:
```javascript
const response = await fetch('/api/admin/payment/refund', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminJwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    transactionId: 'TXN_A1B2C3D4E5',
    amount: 9440.00,
    reason: 'Course cancellation requested by student',
    twoFactorCode: '123456'
  })
});

const data = await response.json();
if (data.success) {
  console.log('Refund initiated:', data.data.refundTransactionId);
}
```


---

### 2. Get Gateway Configuration

Retrieves the current HDFC SmartGateway configuration settings.

**Endpoint**: `GET /api/admin/payment/config`

**Authentication**: Required (Admin role)

**Rate Limit**: 20 requests per minute

**Request Headers**:
```http
Authorization: Bearer <admin_jwt_token>
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "merchantId": "SKILLDAD_HDFC",
    "merchantName": "SkillDad Learning Platform",
    "environment": "production",
    "gatewayUrl": "https://smartgateway.hdfcbank.com",
    "enabledPaymentMethods": [
      "credit_card",
      "debit_card",
      "upi",
      "net_banking",
      "wallet"
    ],
    "transactionLimits": {
      "minimum": 10.00,
      "maximum": 500000.00,
      "currency": "INR"
    },
    "sessionTimeoutMinutes": 15,
    "isActive": true,
    "lastModified": {
      "by": {
        "id": "507f1f77bcf86cd799439013",
        "name": "Admin User",
        "email": "admin@skilldad.com"
      },
      "at": "2024-01-10T09:00:00Z"
    }
  }
}
```

**Note**: Sensitive credentials (API keys, secrets) are never returned in the response.

---

### 3. Update Gateway Configuration

Updates the HDFC SmartGateway configuration settings.

**Endpoint**: `PUT /api/admin/payment/config`

**Authentication**: Required (Admin role)

**Rate Limit**: 5 requests per minute

**Request Headers**:
```http
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "enabledPaymentMethods": ["credit_card", "debit_card", "upi"],
  "minTransactionAmount": 50.00,
  "maxTransactionAmount": 300000.00,
  "sessionTimeoutMinutes": 20
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `enabledPaymentMethods` | Array[String] | No | Payment methods to enable |
| `minTransactionAmount` | Number | No | Minimum transaction amount (₹10-₹1000) |
| `maxTransactionAmount` | Number | No | Maximum transaction amount (₹1000-₹500000) |
| `sessionTimeoutMinutes` | Number | No | Session timeout in minutes (5-30) |

**Valid Payment Methods**:
- `credit_card`
- `debit_card`
- `net_banking`
- `upi`
- `wallet`

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Gateway configuration updated successfully",
  "data": {
    "enabledPaymentMethods": ["credit_card", "debit_card", "upi"],
    "minTransactionAmount": 50.00,
    "maxTransactionAmount": 300000.00,
    "sessionTimeoutMinutes": 20,
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

**Error Responses**:

400 Bad Request - Invalid configuration:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CONFIGURATION",
    "message": "Invalid configuration values provided",
    "details": {
      "minTransactionAmount": "Must be between ₹10 and ₹1000",
      "sessionTimeoutMinutes": "Must be between 5 and 30 minutes"
    }
  }
}
```


---

### 4. Test Gateway Connection

Tests the connectivity and authentication with HDFC SmartGateway.

**Endpoint**: `POST /api/admin/payment/test-connection`

**Authentication**: Required (Admin role)

**Rate Limit**: 5 requests per minute

**Request Headers**:
```http
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "gatewayStatus": "connected",
    "responseTime": 245,
    "timestamp": "2024-01-15T10:30:00Z",
    "environment": "production",
    "apiVersion": "v2.1",
    "merchantId": "SKILLDAD_HDFC"
  }
}
```

**Error Responses**:

502 Bad Gateway - Connection failed:
```json
{
  "success": false,
  "error": {
    "code": "GATEWAY_CONNECTION_FAILED",
    "message": "Unable to connect to HDFC SmartGateway",
    "details": {
      "gatewayUrl": "https://smartgateway.hdfcbank.com",
      "errorMessage": "Connection timeout after 5000ms"
    }
  }
}
```

401 Unauthorized - Authentication failed:
```json
{
  "success": false,
  "error": {
    "code": "GATEWAY_AUTH_FAILED",
    "message": "Authentication with HDFC Gateway failed. Please verify API credentials.",
    "details": {
      "merchantId": "SKILLDAD_HDFC"
    }
  }
}
```


---

## Reconciliation Endpoints

### 1. Run Reconciliation

Initiates a reconciliation process to match internal transactions with HDFC settlement reports.

**Endpoint**: `POST /api/admin/reconciliation/run`

**Authentication**: Required (Finance role)

**Rate Limit**: 10 requests per day

**Request Headers**:
```http
Authorization: Bearer <finance_jwt_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | String (ISO 8601 date) | Yes | Start date for reconciliation period |
| `endDate` | String (ISO 8601 date) | Yes | End date for reconciliation period |

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "reconciliationId": "REC_1234567890",
    "status": "in_progress",
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "estimatedCompletionTime": "2024-01-15T10:35:00Z"
  }
}
```

**Note**: Reconciliation is an asynchronous process. Use the reconciliation ID to check status and retrieve the report.

---

### 2. Get Reconciliation Report

Retrieves a completed reconciliation report with summary and discrepancies.

**Endpoint**: `GET /api/admin/reconciliation/:reconciliationId`

**Authentication**: Required (Finance role)

**Rate Limit**: 20 requests per minute

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reconciliationId` | String | Yes | Reconciliation ID from run reconciliation |

**Request Headers**:
```http
Authorization: Bearer <finance_jwt_token>
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "reconciliationId": "REC_1234567890",
    "status": "completed",
    "reconciliationDate": "2024-02-01T00:00:00Z",
    "period": {
      "startDate": "2024-01-01",
      "endDate": "2024-01-31"
    },
    "summary": {
      "totalTransactions": 1250,
      "matchedTransactions": 1245,
      "unmatchedTransactions": 5,
      "matchRate": 99.6,
      "amounts": {
        "total": 12500000.00,
        "settled": 12450000.00,
        "pending": 50000.00,
        "currency": "INR"
      }
    },
    "discrepancies": [
      {
        "transactionId": "TXN_A1B2C3D4E5",
        "type": "amount_mismatch",
        "systemAmount": 10000.00,
        "gatewayAmount": 9950.00,
        "difference": 50.00,
        "possibleReason": "Gateway processing fee",
        "resolved": false,
        "notes": null
      },
      {
        "transactionId": "TXN_B2C3D4E5F6",
        "type": "missing_in_gateway",
        "systemAmount": 15000.00,
        "gatewayAmount": null,
        "possibleReason": "Settlement pending",
        "resolved": false,
        "notes": null
      }
    ],
    "reportUrl": "https://skilldad.com/reports/REC_1234567890.xlsx",
    "performedBy": {
      "id": "507f1f77bcf86cd799439014",
      "name": "Finance User",
      "email": "finance@skilldad.com"
    }
  }
}
```

**Discrepancy Types**:
- `amount_mismatch`: Transaction amounts don't match between systems
- `missing_in_system`: Transaction exists in gateway but not in SkillDad
- `missing_in_gateway`: Transaction exists in SkillDad but not in gateway settlement
- `status_mismatch`: Transaction status differs between systems


---

### 3. Resolve Discrepancy

Marks a reconciliation discrepancy as resolved with notes.

**Endpoint**: `POST /api/admin/reconciliation/resolve`

**Authentication**: Required (Finance role)

**Rate Limit**: 20 requests per minute

**Request Headers**:
```http
Authorization: Bearer <finance_jwt_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "reconciliationId": "REC_1234567890",
  "transactionId": "TXN_A1B2C3D4E5",
  "notes": "Gateway fee deducted. Amount verified with bank statement. Discrepancy is expected."
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reconciliationId` | String | Yes | Reconciliation ID |
| `transactionId` | String | Yes | Transaction ID with discrepancy |
| `notes` | String | Yes | Resolution notes (10-1000 characters) |

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Discrepancy resolved successfully",
  "data": {
    "reconciliationId": "REC_1234567890",
    "transactionId": "TXN_A1B2C3D4E5",
    "resolved": true,
    "resolvedBy": {
      "id": "507f1f77bcf86cd799439014",
      "name": "Finance User",
      "email": "finance@skilldad.com"
    },
    "resolvedAt": "2024-01-15T10:30:00Z",
    "notes": "Gateway fee deducted. Amount verified with bank statement. Discrepancy is expected."
  }
}
```


---

## Monitoring Endpoints

### 1. Get Payment Metrics

Retrieves payment system metrics and analytics for a specified time range.

**Endpoint**: `GET /api/admin/monitoring/metrics`

**Authentication**: Required (Admin role)

**Rate Limit**: 20 requests per minute

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `timeRange` | String | No | 24h | Time range: 24h, 7d, 30d |

**Request Headers**:
```http
Authorization: Bearer <admin_jwt_token>
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "timeRange": "24h",
    "period": {
      "start": "2024-01-14T10:30:00Z",
      "end": "2024-01-15T10:30:00Z"
    },
    "transactions": {
      "totalAttempts": 150,
      "successfulPayments": 142,
      "failedPayments": 8,
      "pendingPayments": 0,
      "successRate": 94.67
    },
    "amounts": {
      "totalAmount": 1420000.00,
      "averageTransactionAmount": 10000.00,
      "currency": "INR"
    },
    "performance": {
      "averageProcessingTime": 3.2,
      "medianProcessingTime": 2.8,
      "p95ProcessingTime": 5.1,
      "unit": "seconds"
    },
    "paymentMethodDistribution": {
      "credit_card": {
        "count": 45,
        "percentage": 30.0,
        "amount": 450000.00
      },
      "debit_card": {
        "count": 38,
        "percentage": 25.3,
        "amount": 380000.00
      },
      "upi": {
        "count": 42,
        "percentage": 28.0,
        "amount": 420000.00
      },
      "net_banking": {
        "count": 17,
        "percentage": 11.3,
        "amount": 170000.00
      },
      "wallet": {
        "count": 8,
        "percentage": 5.3,
        "amount": 80000.00
      }
    },
    "failureReasons": {
      "insufficient_funds": {
        "count": 3,
        "percentage": 37.5
      },
      "card_declined": {
        "count": 2,
        "percentage": 25.0
      },
      "network_error": {
        "count": 2,
        "percentage": 25.0
      },
      "gateway_timeout": {
        "count": 1,
        "percentage": 12.5
      }
    },
    "topCourses": [
      {
        "courseId": "507f1f77bcf86cd799439011",
        "title": "Full Stack Development Bootcamp",
        "transactionCount": 45,
        "totalRevenue": 450000.00
      },
      {
        "courseId": "507f1f77bcf86cd799439012",
        "title": "Data Science with Python",
        "transactionCount": 38,
        "totalRevenue": 456000.00
      }
    ]
  }
}
```

**Usage Example**:
```javascript
// Get last 7 days metrics
const response = await fetch('/api/admin/monitoring/metrics?timeRange=7d', {
  headers: {
    'Authorization': `Bearer ${adminJwtToken}`
  }
});

const data = await response.json();
console.log(`Success rate: ${data.data.transactions.successRate}%`);
```


---

### 2. Get System Health

Retrieves the health status of payment system components.

**Endpoint**: `GET /api/admin/monitoring/health`

**Authentication**: Required (Admin role)

**Rate Limit**: 20 requests per minute

**Request Headers**:
```http
Authorization: Bearer <admin_jwt_token>
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "overall": "healthy",
    "components": {
      "database": {
        "status": "healthy",
        "responseTime": 12,
        "details": {
          "connected": true,
          "activeConnections": 15,
          "maxConnections": 100
        }
      },
      "hdfc_gateway": {
        "status": "healthy",
        "responseTime": 245,
        "details": {
          "connected": true,
          "lastSuccessfulRequest": "2024-01-15T10:29:45Z",
          "apiVersion": "v2.1"
        }
      },
      "redis_cache": {
        "status": "healthy",
        "responseTime": 5,
        "details": {
          "connected": true,
          "memoryUsage": "45MB",
          "hitRate": 92.5
        }
      },
      "email_service": {
        "status": "healthy",
        "responseTime": 150,
        "details": {
          "connected": true,
          "queueSize": 3
        }
      }
    },
    "alerts": [],
    "metrics": {
      "successRate": 94.67,
      "averageResponseTime": 3.2,
      "errorRate": 5.33
    },
    "lastChecked": "2024-01-15T10:30:00Z"
  }
}
```

**Component Status Values**:
- `healthy`: Component is functioning normally
- `degraded`: Component is experiencing issues but still operational
- `unhealthy`: Component is not functioning properly
- `unknown`: Unable to determine component status

**Overall Status**:
- `healthy`: All components are healthy
- `degraded`: One or more components are degraded
- `unhealthy`: One or more critical components are unhealthy

**With Alerts** (200 OK):
```json
{
  "success": true,
  "data": {
    "overall": "degraded",
    "components": {
      "database": {
        "status": "healthy",
        "responseTime": 12
      },
      "hdfc_gateway": {
        "status": "degraded",
        "responseTime": 5200,
        "details": {
          "connected": true,
          "lastSuccessfulRequest": "2024-01-15T10:29:45Z",
          "warning": "Response time exceeds threshold (5000ms)"
        }
      },
      "redis_cache": {
        "status": "healthy",
        "responseTime": 5
      }
    },
    "alerts": [
      {
        "severity": "warning",
        "component": "hdfc_gateway",
        "message": "Gateway response time exceeds 5 seconds",
        "threshold": 5000,
        "currentValue": 5200,
        "timestamp": "2024-01-15T10:30:00Z"
      },
      {
        "severity": "warning",
        "component": "payment_system",
        "message": "Payment success rate below 90%",
        "threshold": 90,
        "currentValue": 87.5,
        "timestamp": "2024-01-15T10:28:00Z"
      }
    ],
    "lastChecked": "2024-01-15T10:30:00Z"
  }
}
```

**Alert Severity Levels**:
- `info`: Informational message
- `warning`: Warning that requires attention
- `error`: Error that needs immediate action
- `critical`: Critical issue affecting system operation


---

## Webhook Integration

### Webhook Endpoint

HDFC SmartGateway sends asynchronous webhook notifications for payment status updates.

**Endpoint**: `POST /api/payment/webhook`

**Authentication**: HMAC-SHA256 signature verification

**Rate Limit**: None (gateway-initiated)

**Request Headers**:
```http
Content-Type: application/json
X-HDFC-Signature: <hmac_sha256_signature>
X-HDFC-Timestamp: 1642345678
```

**Request Body**:
```json
{
  "transactionId": "TXN_A1B2C3D4E5",
  "gatewayTransactionId": "HDFC_987654321",
  "status": "success",
  "amount": 9440.00,
  "currency": "INR",
  "paymentMethod": "credit_card",
  "paymentMethodDetails": {
    "cardType": "Visa",
    "cardLast4": "1234",
    "bankName": "HDFC Bank"
  },
  "timestamp": "2024-01-15T10:25:30Z",
  "signature": "abc123def456..."
}
```

**Webhook Payload Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `transactionId` | String | SkillDad transaction ID |
| `gatewayTransactionId` | String | HDFC Gateway transaction ID |
| `status` | String | Payment status: success, failed, pending |
| `amount` | Number | Transaction amount |
| `currency` | String | Currency code (INR) |
| `paymentMethod` | String | Payment method used |
| `paymentMethodDetails` | Object | Additional payment method details |
| `timestamp` | String (ISO 8601) | Webhook timestamp |
| `signature` | String | HMAC-SHA256 signature |

**Payment Status Values**:
- `success`: Payment completed successfully
- `failed`: Payment failed
- `pending`: Payment is being processed
- `refunded`: Payment has been refunded

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Webhook processed successfully"
}
```

**Error Responses**:

401 Unauthorized - Invalid signature:
```json
{
  "success": false,
  "error": {
    "code": "SIGNATURE_VERIFICATION_FAILED",
    "message": "Webhook signature verification failed"
  }
}
```

404 Not Found - Transaction not found:
```json
{
  "success": false,
  "error": {
    "code": "TRANSACTION_NOT_FOUND",
    "message": "No transaction found with the specified ID"
  }
}
```

500 Internal Server Error - Processing error:
```json
{
  "success": false,
  "error": {
    "code": "WEBHOOK_PROCESSING_ERROR",
    "message": "An error occurred while processing the webhook"
  }
}
```

### Webhook Signature Verification

The webhook signature is verified using HMAC-SHA256 to ensure authenticity.

**Signature Generation Algorithm**:
1. Sort all payload fields alphabetically by key
2. Concatenate as `key1=value1&key2=value2&...`
3. Compute HMAC-SHA256 using the API secret
4. Compare with provided signature using constant-time comparison

**Example Verification (Node.js)**:
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  // Sort keys alphabetically
  const sortedKeys = Object.keys(payload).sort();
  
  // Build string to sign
  const stringToSign = sortedKeys
    .map(key => `${key}=${payload[key]}`)
    .join('&');
  
  // Compute HMAC
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(stringToSign)
    .digest('hex');
  
  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

### Webhook Retry Policy

If webhook processing fails (HTTP 500), HDFC Gateway will retry with exponential backoff:

| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1 | Immediate | 0s |
| 2 | 1 minute | 1m |
| 3 | 5 minutes | 6m |
| 4 | 15 minutes | 21m |
| 5 | 1 hour | 1h 21m |
| 6 | 6 hours | 7h 21m |

After 6 failed attempts, the webhook is marked as failed and manual reconciliation is required.

### Webhook Idempotency

Webhooks may be delivered multiple times. The system handles this by:
1. Checking if the webhook has already been processed
2. Comparing the new status with the existing status
3. Only updating if the status has changed
4. Always returning 200 OK for duplicate webhooks

**Idempotency Key**: `transactionId` + `status` + `timestamp`


---

## Security

### HTTPS/TLS

All API endpoints require HTTPS with TLS 1.2 or higher. HTTP requests are automatically redirected to HTTPS.

### CSRF Protection

Payment initiation endpoints require CSRF token validation to prevent cross-site request forgery attacks.

**Get CSRF Token**:
```http
GET /api/payment/csrf-token
```

**Response**:
```json
{
  "csrfToken": "abc123def456..."
}
```

**Include in Request**:
```http
POST /api/payment/initiate
X-CSRF-Token: abc123def456...
```

### Input Validation

All input is validated and sanitized:
- String inputs are trimmed and HTML-escaped
- Numeric inputs are validated for type and range
- MongoDB ObjectIds are validated for format
- Transaction IDs must match pattern: `TXN_[A-Z0-9]{10}`
- Discount codes must be 4-20 alphanumeric characters

### PCI-DSS Compliance

The payment system is PCI-DSS compliant:
- **No card data storage**: Card numbers, CVV, and PINs are never stored
- **Hosted payment pages**: Card data is collected by HDFC Gateway, not SkillDad
- **Encryption**: All sensitive data is encrypted using AES-256-GCM
- **Audit logs**: All payment operations are logged for 7 years minimum
- **Access control**: Role-based access control with 2FA for sensitive operations

### Data Masking

Sensitive data is masked in logs and responses:
- Card numbers: Only last 4 digits shown (e.g., `****1234`)
- CVV/PIN: Never logged or stored
- API credentials: Never returned in API responses

### Signature Verification

All communication with HDFC Gateway uses HMAC-SHA256 signatures:
- **Outgoing requests**: Signed with API secret
- **Incoming callbacks**: Signature verified before processing
- **Webhooks**: Signature verified before processing
- **Constant-time comparison**: Prevents timing attacks

### Session Security

Payment sessions are secured with:
- **Cryptographically secure session IDs**: Generated using `crypto.randomBytes(32)`
- **15-minute expiration**: Sessions expire after 15 minutes of inactivity
- **Automatic cleanup**: Expired sessions are automatically deleted
- **One-time use**: Sessions cannot be reused after completion

### Rate Limiting

Rate limiting prevents abuse and DDoS attacks:
- **Per-user limits**: Tracked by user ID
- **Per-transaction limits**: Tracked by transaction ID
- **Redis-backed**: Distributed rate limiting across servers
- **Exponential backoff**: Suggested retry times in responses

### Audit Logging

All payment operations are logged:
- **Transaction attempts**: User ID, IP address, user agent
- **Status changes**: Old status, new status, timestamp
- **Refund operations**: Admin ID, amount, reason
- **Security events**: Signature failures, unauthorized access
- **7-year retention**: Logs retained for compliance

### IP Whitelisting (Optional)

For webhook endpoints, IP whitelisting can be configured to only accept requests from HDFC Gateway IP addresses.

**HDFC Gateway IP Ranges** (example):
```
203.192.xxx.xxx/24
203.193.xxx.xxx/24
```

### Security Headers

All responses include security headers:
```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
```


---

## Complete API Reference

### Endpoint Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| **Student Endpoints** |
| POST | `/api/payment/initiate` | JWT | Create payment session |
| GET | `/api/payment/callback` | Signature | Handle payment callback |
| GET | `/api/payment/status/:id` | JWT | Check payment status |
| GET | `/api/payment/history` | JWT | Get payment history |
| GET | `/api/payment/receipt/:id` | JWT | Download receipt |
| POST | `/api/payment/retry/:id` | JWT | Retry failed payment |
| **Admin Endpoints** |
| POST | `/api/admin/payment/refund` | Admin+2FA | Process refund |
| GET | `/api/admin/payment/config` | Admin | Get configuration |
| PUT | `/api/admin/payment/config` | Admin | Update configuration |
| POST | `/api/admin/payment/test-connection` | Admin | Test gateway |
| **Reconciliation Endpoints** |
| POST | `/api/admin/reconciliation/run` | Finance | Run reconciliation |
| GET | `/api/admin/reconciliation/:id` | Finance | Get report |
| POST | `/api/admin/reconciliation/resolve` | Finance | Resolve discrepancy |
| **Monitoring Endpoints** |
| GET | `/api/admin/monitoring/metrics` | Admin | Get metrics |
| GET | `/api/admin/monitoring/health` | Admin | Get system health |
| **Webhook Endpoint** |
| POST | `/api/payment/webhook` | Signature | Receive webhook |

---

## Usage Examples

### Complete Payment Flow (JavaScript)

```javascript
// 1. Get CSRF token
async function getCsrfToken() {
  const response = await fetch('/api/payment/csrf-token', {
    credentials: 'include'
  });
  const data = await response.json();
  return data.csrfToken;
}

// 2. Initiate payment
async function initiatePayment(courseId, discountCode = null) {
  const csrfToken = await getCsrfToken();
  
  const response = await fetch('/api/payment/initiate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`,
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({
      courseId,
      discountCode
    })
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Store transaction ID for later reference
    localStorage.setItem('pendingTransactionId', data.data.transactionId);
    
    // Redirect to payment gateway
    window.location.href = data.data.paymentUrl;
  } else {
    console.error('Payment initiation failed:', data.error);
    alert(data.error.message);
  }
}

// 3. Check payment status after callback
async function checkPaymentStatus(transactionId) {
  const response = await fetch(`/api/payment/status/${transactionId}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    const status = data.data.status;
    
    if (status === 'success') {
      console.log('Payment successful!');
      console.log('Receipt URL:', data.data.receiptUrl);
      // Clear pending transaction
      localStorage.removeItem('pendingTransactionId');
    } else if (status === 'failed') {
      console.log('Payment failed');
      // Offer retry option
    }
  }
  
  return data;
}

// 4. Download receipt
function downloadReceipt(transactionId) {
  const token = localStorage.getItem('jwtToken');
  window.location.href = `/api/payment/receipt/${transactionId}?token=${token}`;
}

// 5. Retry failed payment
async function retryPayment(transactionId) {
  const response = await fetch(`/api/payment/retry/${transactionId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Redirect to new payment URL
    window.location.href = data.data.paymentUrl;
  } else {
    console.error('Retry failed:', data.error);
    alert(data.error.message);
  }
}

// Usage
initiatePayment('507f1f77bcf86cd799439011', 'PARTNER20');
```

### Admin Refund Processing (JavaScript)

```javascript
async function processRefund(transactionId, amount, reason, twoFactorCode) {
  const response = await fetch('/api/admin/payment/refund', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('adminJwtToken')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      transactionId,
      amount,
      reason,
      twoFactorCode
    })
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log('Refund initiated:', data.data.refundTransactionId);
    console.log('Estimated completion:', data.data.estimatedCompletionDate);
    alert('Refund processed successfully');
  } else {
    console.error('Refund failed:', data.error);
    alert(data.error.message);
  }
}

// Usage
processRefund('TXN_A1B2C3D4E5', 9440.00, 'Course cancellation', '123456');
```

### Monitoring Dashboard (JavaScript)

```javascript
async function loadDashboard() {
  // Get metrics
  const metricsResponse = await fetch('/api/admin/monitoring/metrics?timeRange=24h', {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('adminJwtToken')}`
    }
  });
  const metrics = await metricsResponse.json();
  
  // Get health status
  const healthResponse = await fetch('/api/admin/monitoring/health', {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('adminJwtToken')}`
    }
  });
  const health = await healthResponse.json();
  
  // Display metrics
  console.log('Success Rate:', metrics.data.transactions.successRate + '%');
  console.log('Total Amount:', '₹' + metrics.data.amounts.totalAmount);
  console.log('System Health:', health.data.overall);
  
  // Check for alerts
  if (health.data.alerts.length > 0) {
    console.warn('Active Alerts:', health.data.alerts);
  }
}

// Refresh dashboard every 30 seconds
setInterval(loadDashboard, 30000);
```

### Webhook Handler (Node.js/Express)

```javascript
const crypto = require('crypto');
const express = require('express');

const router = express.Router();

// Webhook endpoint
router.post('/api/payment/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['x-hdfc-signature'];
    
    // Verify signature
    if (!verifySignature(payload, signature)) {
      console.error('Webhook signature verification failed');
      return res.status(401).json({
        success: false,
        error: {
          code: 'SIGNATURE_VERIFICATION_FAILED',
          message: 'Webhook signature verification failed'
        }
      });
    }
    
    // Find transaction
    const transaction = await Transaction.findOne({
      transactionId: payload.transactionId
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found'
        }
      });
    }
    
    // Check idempotency
    const alreadyProcessed = transaction.webhookData.some(
      wh => wh.data.status === payload.status && 
            wh.data.timestamp === payload.timestamp
    );
    
    if (alreadyProcessed) {
      return res.json({
        success: true,
        message: 'Webhook already processed'
      });
    }
    
    // Update transaction
    transaction.status = payload.status;
    transaction.webhookData.push({
      data: payload,
      receivedAt: new Date(),
      processed: true
    });
    
    await transaction.save();
    
    // Send confirmation email if success
    if (payload.status === 'success') {
      await sendPaymentConfirmationEmail(transaction);
    }
    
    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_PROCESSING_ERROR',
        message: 'An error occurred while processing the webhook'
      }
    });
  }
});

function verifySignature(payload, signature) {
  const secret = process.env.HDFC_API_SECRET;
  const sortedKeys = Object.keys(payload).sort();
  const stringToSign = sortedKeys
    .map(key => `${key}=${payload[key]}`)
    .join('&');
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(stringToSign)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

module.exports = router;
```

---

## Support and Contact

For technical support or questions about the Payment API:

- **Email**: tech-support@skilldad.com
- **Documentation**: https://docs.skilldad.com/payment-api
- **Status Page**: https://status.skilldad.com
- **Developer Portal**: https://developers.skilldad.com

For HDFC SmartGateway specific issues:
- **HDFC Support**: merchantsupport@hdfcbank.com
- **HDFC Documentation**: https://smartgateway.hdfcbank.com/docs

---

## Changelog

### Version 1.0.0 (2024-01-15)
- Initial release
- Support for multiple payment methods
- Webhook integration
- Reconciliation system
- Monitoring and metrics
- Admin refund processing

---

**Last Updated**: January 15, 2024  
**API Version**: v1.0.0  
**Document Version**: 1.0.0
