# HDFC SmartGateway Payment Integration - Test Mode Setup

## Overview
The HDFC SmartGateway payment integration has been configured in **TEST/SANDBOX MODE** and is ready for testing and demonstration.

## Configuration Files

### 1. Environment Variables (`server/.env`)
Test credentials have been added:
```env
HDFC_MERCHANT_ID=TEST_MERCHANT_12345
HDFC_API_KEY=test_api_key_67890
HDFC_API_SECRET=test_secret_key_abcdef123456
HDFC_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
HDFC_GATEWAY_URL=https://sandbox.hdfcbank.com/smartgateway
HDFC_MODE=sandbox
HDFC_SESSION_TIMEOUT=900000
HDFC_MIN_AMOUNT=10
HDFC_MAX_AMOUNT=500000
```

### 2. Database Seeding (`server/seed_gateway.js`)
Seeds the GatewayConfig collection with test credentials from environment variables.

**Run the seeder:**
```bash
cd server
node seed_gateway.js
```

**What it does:**
- Clears existing GatewayConfig documents
- Creates new configuration with test credentials
- Enables all payment methods: card, netbanking, UPI, wallet
- Sets transaction limits: ₹10 - ₹500,000
- Configures 15-minute session timeout

### 3. Test Script (`server/test_payment_flow.js`)
Comprehensive test script that verifies the payment system setup.

**Run the test:**
```bash
cd server
node test_payment_flow.js
```

**What it tests:**
- ✓ MongoDB connection
- ✓ Gateway configuration verification
- ✓ CSRF token generation
- ✓ Course data retrieval (or mock data)
- ✓ Transaction amount validation
- ✓ Payment data preparation
- ✓ Payment URL generation

## Payment Routes

All payment routes are configured in `server/server.js`:

### Public Routes
- `GET /api/payment/csrf-token` - Generate CSRF token
- `GET /api/payment/callback` - Handle payment callback
- `POST /api/payment/webhook` - Handle webhook notifications

### Protected Routes (Require Authentication)
- `POST /api/payment/initiate` - Initiate payment
- `GET /api/payment/status/:transactionId` - Check payment status
- `GET /api/payment/history` - Get payment history
- `GET /api/payment/receipt/:transactionId` - Download receipt
- `POST /api/payment/retry/:transactionId` - Retry failed payment

## Testing the Payment Flow

### 1. Start the Server
```bash
cd server
npm start
```

### 2. Test Payment Initiation
Use Postman or curl to test the payment API:

```bash
POST http://localhost:3030/api/payment/initiate
Headers:
  Authorization: Bearer <your_jwt_token>
  Content-Type: application/json
Body:
{
  "courseId": "<course_id>"
}
```

### 3. Expected Response
```json
{
  "success": true,
  "data": {
    "transactionId": "TXN_...",
    "orderId": "ORD_...",
    "paymentUrl": "https://sandbox.hdfcbank.com/smartgateway/...",
    "amount": 5000,
    "currency": "INR"
  }
}
```

## Gateway Configuration Details

### Enabled Payment Methods
- Credit Card
- Debit Card
- Net Banking
- UPI
- Wallet

### Transaction Limits
- Minimum: ₹10
- Maximum: ₹500,000

### Session Configuration
- Timeout: 15 minutes (900,000 ms)
- Rate Limit: 5 requests per minute per user

### Environment
- Mode: **sandbox** (test mode)
- Gateway URL: https://sandbox.hdfcbank.com/smartgateway

## Security Features

1. **CSRF Protection**: Token-based CSRF protection for payment initiation
2. **Rate Limiting**: Prevents abuse with configurable rate limits
3. **Signature Verification**: Webhook and callback signature verification
4. **JWT Authentication**: Protected routes require valid JWT tokens
5. **Role-Based Access**: Different access levels for students, admins, and finance team

## Next Steps

1. **Add Test Courses**: Create courses in the database for testing
2. **Test User Authentication**: Ensure JWT tokens are working
3. **Test Payment Flow**: Initiate test payments and verify callbacks
4. **Monitor Logs**: Check server logs for payment processing
5. **Test Webhooks**: Verify webhook handling for payment notifications

## Troubleshooting

### No Active Courses
If you see "No active courses found", run:
```bash
cd server
node addDemoCourses.js
```

### Gateway Configuration Not Found
Re-run the seeder:
```bash
cd server
node seed_gateway.js
```

### Connection Issues
Check MongoDB connection:
```bash
cd server
node test_db.js
```

## Production Deployment

⚠️ **IMPORTANT**: Before deploying to production:

1. Replace test credentials with real HDFC credentials
2. Change `HDFC_MODE` from `sandbox` to `production`
3. Update `HDFC_GATEWAY_URL` to production URL
4. Configure proper callback and webhook URLs
5. Enable SSL/TLS for all endpoints
6. Set up proper monitoring and alerting
7. Test thoroughly in staging environment

## Support

For issues or questions:
- Check server logs: `server/server_debug.log`
- Review payment controller: `server/controllers/paymentController.js`
- Check gateway config: `server/models/payment/GatewayConfig.js`
