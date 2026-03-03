# Razorpay Webhook Configuration Guide

This guide explains how to configure Razorpay webhooks for the SkillDad payment system.

## Overview

Razorpay webhooks notify your server about payment events in real-time. This ensures that course enrollment is activated even if the user closes the browser after payment.

## Webhook URL

Your webhook endpoint URL should be:

```
https://your-domain.com/api/payment/webhook
```

**Important:** The webhook URL must be publicly accessible (not localhost). For local development, use a tunneling service like ngrok.

## Webhook Events

Configure your webhook to listen for these events:

1. **payment.captured** - Payment was successfully captured
2. **payment.failed** - Payment failed

## Configuration Steps

### 1. Access Razorpay Dashboard

1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Navigate to **Settings** → **Webhooks**

### 2. Create Webhook

1. Click **+ Add New Webhook**
2. Enter your webhook URL: `https://your-domain.com/api/payment/webhook`
3. Select the following events:
   - ✅ payment.captured
   - ✅ payment.failed
4. Set **Active** to ON
5. Click **Create Webhook**

### 3. Get Webhook Secret

After creating the webhook:

1. Click on the webhook you just created
2. Copy the **Webhook Secret** (starts with `whsec_`)
3. Add it to your `.env` file:

```env
RAZORPAY_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 4. Test Webhook

Razorpay provides a webhook testing tool:

1. In the webhook details page, click **Send Test Webhook**
2. Select `payment.captured` event
3. Click **Send**
4. Check your server logs to verify the webhook was received and processed

## Webhook Payload Examples

### payment.captured Event

```json
{
  "entity": "event",
  "account_id": "acc_xxxxx",
  "event": "payment.captured",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_xxxxx",
        "entity": "payment",
        "amount": 50000,
        "currency": "INR",
        "status": "captured",
        "order_id": "order_xxxxx",
        "method": "card",
        "captured": true,
        "email": "student@example.com",
        "contact": "+919876543210",
        "created_at": 1234567890
      }
    }
  },
  "created_at": 1234567890
}
```

### payment.failed Event

```json
{
  "entity": "event",
  "account_id": "acc_xxxxx",
  "event": "payment.failed",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_xxxxx",
        "entity": "payment",
        "amount": 50000,
        "currency": "INR",
        "status": "failed",
        "order_id": "order_xxxxx",
        "method": "card",
        "error_code": "BAD_REQUEST_ERROR",
        "error_description": "Payment failed",
        "created_at": 1234567890
      }
    }
  },
  "created_at": 1234567890
}
```

## Security

### Signature Verification

The webhook endpoint automatically verifies the Razorpay signature using the webhook secret. This ensures that webhook requests are genuine and come from Razorpay.

The signature is sent in the `x-razorpay-signature` header and is verified using HMAC SHA256.

### IP Whitelisting (Optional)

For additional security, you can whitelist Razorpay's webhook IPs in your firewall:

- Check [Razorpay's IP addresses](https://razorpay.com/docs/webhooks/validate-test/#ip-whitelisting) for the latest list

## Troubleshooting

### Webhook Not Received

1. **Check URL accessibility**: Ensure your webhook URL is publicly accessible
2. **Verify webhook secret**: Ensure `RAZORPAY_WEBHOOK_SECRET` is correctly set in `.env`
3. **Check server logs**: Look for webhook processing errors
4. **Test with ngrok**: For local development, use ngrok to expose your local server

### Signature Verification Failed

1. **Check webhook secret**: Ensure the secret matches the one in Razorpay dashboard
2. **Check raw body**: Ensure your server is not parsing the webhook body before verification
3. **Check middleware order**: Ensure signature verification happens before body parsing

### Duplicate Webhooks

Razorpay may send the same webhook multiple times. The payment controller handles idempotency by checking the transaction status before processing.

## Local Development

For local development, use ngrok to expose your local server:

```bash
# Start your server
npm run dev

# In another terminal, start ngrok
ngrok http 5000

# Use the ngrok URL as your webhook URL
# Example: https://abc123.ngrok.io/api/payment/webhook
```

## Production Checklist

- [ ] Webhook URL is publicly accessible
- [ ] Webhook secret is set in production `.env`
- [ ] SSL/TLS certificate is valid
- [ ] Webhook events are configured (payment.captured, payment.failed)
- [ ] Webhook is set to Active
- [ ] Test webhook with Razorpay's testing tool
- [ ] Monitor webhook logs for errors

## Monitoring

Monitor webhook processing in your application logs:

```bash
# Search for webhook logs
grep "Webhook" server.log

# Check for webhook errors
grep "Error handling webhook" server.log
```

## Support

For issues with Razorpay webhooks:

- [Razorpay Webhook Documentation](https://razorpay.com/docs/webhooks/)
- [Razorpay Support](https://razorpay.com/support/)
