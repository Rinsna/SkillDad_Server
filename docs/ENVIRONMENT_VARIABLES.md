# Environment Variables Documentation

This document describes all environment variables used in the SkillDad platform.

## Table of Contents

- [Server Configuration](#server-configuration)
- [Database](#database)
- [Authentication](#authentication)
- [Zoom Integration](#zoom-integration)
- [Email Configuration](#email-configuration)
- [Payment Gateway](#payment-gateway)
- [WhatsApp Integration](#whatsapp-integration)
- [Deprecated Variables](#deprecated-variables)

---

## Server Configuration

### `PORT`
- **Type**: Number
- **Default**: `3030`
- **Description**: The port on which the server will listen for incoming requests.
- **Example**: `PORT=3030`

### `NODE_ENV`
- **Type**: String
- **Values**: `development`, `production`, `test`
- **Default**: `development`
- **Description**: Specifies the environment in which the application is running.
- **Example**: `NODE_ENV=production`

### `CLIENT_URL`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: The URL of the client application. Used for CORS configuration and generating redirect URLs.
- **Example**: `CLIENT_URL=http://localhost:5173`

---

## Database

### `MONGO_URI`
- **Type**: String (MongoDB Connection String)
- **Required**: Yes
- **Description**: MongoDB connection string for the application database.
- **Example**: `MONGO_URI=mongodb://127.0.0.1:27017/skilldad`

### `REDIS_URL`
- **Type**: String (Redis Connection String)
- **Required**: Yes
- **Description**: Redis connection string for caching and session management.
- **Example**: `REDIS_URL=redis://localhost:6379`

---

## Authentication

### `JWT_SECRET`
- **Type**: String
- **Required**: Yes
- **Security**: High - Keep this secret secure
- **Description**: Secret key used for signing and verifying JWT tokens.
- **Example**: `JWT_SECRET=your_jwt_secret_key_here`

---

## Zoom Integration

The platform uses Zoom for live educational sessions. You need both API credentials (for creating meetings) and SDK credentials (for embedding meetings in the client).

### Getting Zoom Credentials

1. **Create a Zoom Account**: Sign up at [zoom.us](https://zoom.us)
2. **Create a Server-to-Server OAuth App**: 
   - Go to [Zoom App Marketplace](https://marketplace.zoom.us/)
   - Click "Develop" → "Build App"
   - Select "Server-to-Server OAuth"
   - This provides your API credentials
3. **Create a Meeting SDK App**:
   - Go to [Zoom App Marketplace](https://marketplace.zoom.us/)
   - Click "Develop" → "Build App"
   - Select "Meeting SDK"
   - This provides your SDK credentials

### Zoom API Credentials

Used by the backend to create and manage Zoom meetings.

#### `ZOOM_API_KEY`
- **Type**: String
- **Required**: Yes
- **Description**: Zoom Server-to-Server OAuth Client ID
- **Example**: `ZOOM_API_KEY=your_zoom_api_key_here`

#### `ZOOM_API_SECRET`
- **Type**: String
- **Required**: Yes
- **Security**: High - Never expose to client
- **Description**: Zoom Server-to-Server OAuth Client Secret
- **Example**: `ZOOM_API_SECRET=your_zoom_api_secret_here`

#### `ZOOM_ACCOUNT_ID`
- **Type**: String
- **Required**: Yes
- **Description**: Zoom Account ID for Server-to-Server OAuth
- **Example**: `ZOOM_ACCOUNT_ID=your_zoom_account_id_here`

### Zoom SDK Credentials

Used by the backend to generate signatures for client-side meeting embedding.

#### `ZOOM_SDK_KEY`
- **Type**: String
- **Required**: Yes
- **Description**: Zoom Meeting SDK Key (Client ID)
- **Example**: `ZOOM_SDK_KEY=your_zoom_sdk_key_here`

#### `ZOOM_SDK_SECRET`
- **Type**: String
- **Required**: Yes
- **Security**: Critical - Never expose to client
- **Description**: Zoom Meeting SDK Secret used for generating JWT signatures
- **Example**: `ZOOM_SDK_SECRET=your_zoom_sdk_secret_here`

### Zoom Webhook Configuration

#### `ZOOM_WEBHOOK_SECRET`
- **Type**: String
- **Required**: Yes (for webhook verification)
- **Description**: Secret token for verifying Zoom webhook events (e.g., recording.completed)
- **Example**: `ZOOM_WEBHOOK_SECRET=your_zoom_webhook_secret_here`
- **Setup**: Configure this in your Zoom App's webhook settings

### Zoom Encryption

#### `ZOOM_ENCRYPTION_KEY`
- **Type**: String
- **Required**: Yes
- **Min Length**: 32 characters
- **Description**: Encryption key for storing Zoom meeting passcodes securely in the database
- **Example**: `ZOOM_ENCRYPTION_KEY=your_zoom_encryption_key_here_min_32_chars`
- **Note**: Generate a strong random string of at least 32 characters

---

## Email Configuration

### `EMAIL_HOST`
- **Type**: String
- **Required**: Yes
- **Description**: SMTP server hostname
- **Example**: `EMAIL_HOST=smtp.gmail.com`

### `EMAIL_PORT`
- **Type**: Number
- **Required**: Yes
- **Description**: SMTP server port (465 for SSL, 587 for TLS)
- **Example**: `EMAIL_PORT=465`

### `EMAIL_USER`
- **Type**: String (Email)
- **Required**: Yes
- **Description**: Email account username for SMTP authentication
- **Example**: `EMAIL_USER=your_email@gmail.com`

### `EMAIL_PASSWORD`
- **Type**: String
- **Required**: Yes
- **Security**: High - Use app-specific password for Gmail
- **Description**: Email account password or app-specific password
- **Example**: `EMAIL_PASSWORD=your_email_app_password`

### `EMAIL_FROM`
- **Type**: String (Email)
- **Required**: Yes
- **Description**: Default "From" address for outgoing emails
- **Example**: `EMAIL_FROM=support@skilldad.com`

### `FINANCE_TEAM_EMAILS`
- **Type**: String (Comma-separated emails)
- **Required**: No
- **Description**: Email addresses of finance team members for payment notifications
- **Example**: `FINANCE_TEAM_EMAILS=finance@skilldad.com,accounts@skilldad.com`

---

## Payment Gateway

### `HDFC_MAX_AMOUNT`
- **Type**: Number
- **Required**: Yes
- **Description**: Maximum transaction amount allowed for HDFC SmartGateway (in INR)
- **Example**: `HDFC_MAX_AMOUNT=500000`

### Stripe Configuration

#### `STRIPE_SECRET_KEY`
- **Type**: String
- **Required**: Yes
- **Security**: Critical - Never expose to client
- **Description**: Stripe secret key for API authentication
- **Example**: `STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key`

#### `STRIPE_PUBLISHABLE_KEY`
- **Type**: String
- **Required**: Yes
- **Description**: Stripe publishable key (safe to expose to client)
- **Example**: `STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key`

#### `STRIPE_WEBHOOK_SECRET`
- **Type**: String
- **Required**: Yes (for webhook verification)
- **Description**: Stripe webhook signing secret for verifying webhook events
- **Example**: `STRIPE_WEBHOOK_SECRET=whsec_test_secret`

#### `STRIPE_SUCCESS_URL`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: Redirect URL after successful payment
- **Example**: `STRIPE_SUCCESS_URL=http://localhost:5173/dashboard/payment-callback?status=success`

#### `STRIPE_CANCEL_URL`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: Redirect URL when payment is cancelled
- **Example**: `STRIPE_CANCEL_URL=http://localhost:5173/dashboard/payment-callback?status=cancel`

---

## WhatsApp Integration

The platform uses Gupshup API for sending WhatsApp notifications.

### `GUPSHUP_API_KEY`
- **Type**: String
- **Required**: Yes (if WhatsApp notifications are enabled)
- **Description**: Gupshup API key for authentication
- **Example**: `GUPSHUP_API_KEY=your_gupshup_api_key_here`

### `GUPSHUP_SOURCE`
- **Type**: String (Phone number)
- **Required**: Yes (if WhatsApp notifications are enabled)
- **Description**: WhatsApp Business phone number (with country code)
- **Example**: `GUPSHUP_SOURCE=91xxxxxxxxxx`

### WhatsApp Templates

#### `GUPSHUP_TEMPLATE_LIVE`
- **Type**: String
- **Description**: Template ID for live session scheduled notifications
- **Example**: `GUPSHUP_TEMPLATE_LIVE=live_session_scheduled`

#### `GUPSHUP_TEMPLATE_EXAM`
- **Type**: String
- **Description**: Template ID for exam scheduled notifications
- **Example**: `GUPSHUP_TEMPLATE_EXAM=exam_scheduled`

#### `GUPSHUP_TEMPLATE_RESULT`
- **Type**: String
- **Description**: Template ID for exam result notifications
- **Example**: `GUPSHUP_TEMPLATE_RESULT=exam_result`

#### `GUPSHUP_TEMPLATE_CERT`
- **Type**: String
- **Description**: Template ID for course completion notifications
- **Example**: `GUPSHUP_TEMPLATE_CERT=course_completed`

#### `GUPSHUP_TEMPLATE_WELCOME`
- **Type**: String
- **Description**: Template ID for welcome/onboarding notifications
- **Example**: `GUPSHUP_TEMPLATE_WELCOME=welcome_onboarding`

---

## Miscellaneous

### `TIMEZONE`
- **Type**: String (IANA timezone)
- **Required**: Yes
- **Description**: Timezone for scheduled jobs and time-based operations
- **Example**: `TIMEZONE=Asia/Kolkata`

---

## Deprecated Variables

### ⚠️ Bunny.net Stream Variables (DEPRECATED)

**Status**: These variables are **DEPRECATED** and will be removed in a future release.

**Migration**: The platform has migrated from Bunny.net RTMP/HLS streaming to Zoom for live sessions. These variables are only needed if you have legacy sessions that still reference Bunny.net.

**Removal Timeline**: These variables will be removed after all legacy sessions are migrated or archived.

#### `BUNNY_API_KEY`
- **Status**: DEPRECATED
- **Type**: String
- **Description**: Bunny.net API key (no longer used)
- **Migration**: Use Zoom integration instead

#### `BUNNY_LIBRARY_ID`
- **Status**: DEPRECATED
- **Type**: String
- **Description**: Bunny.net video library ID (no longer used)
- **Migration**: Use Zoom integration instead

#### `BUNNY_TOKEN_KEY`
- **Status**: DEPRECATED
- **Type**: String
- **Description**: Bunny.net token authentication key (no longer used)
- **Migration**: Use Zoom integration instead

#### `BUNNY_PULL_ZONE`
- **Status**: DEPRECATED
- **Type**: String
- **Description**: Bunny.net CDN pull zone hostname (no longer used)
- **Migration**: Use Zoom integration instead

#### `BUNNY_RTMP_ENDPOINT`
- **Status**: DEPRECATED
- **Type**: String
- **Description**: Bunny.net RTMP ingestion endpoint (no longer used)
- **Migration**: Use Zoom integration instead

#### `SIGNED_URL_TTL_SECS`
- **Status**: DEPRECATED
- **Type**: Number
- **Description**: TTL for Bunny.net signed URLs (no longer used)
- **Migration**: Use Zoom integration instead

---

## Security Best Practices

1. **Never commit `.env` files to version control**
   - Add `.env` to `.gitignore`
   - Use `.env.example` as a template

2. **Rotate secrets regularly**
   - Change JWT_SECRET, API keys, and webhook secrets periodically
   - Update Zoom SDK credentials every 90 days

3. **Use strong encryption keys**
   - Generate ZOOM_ENCRYPTION_KEY with at least 32 random characters
   - Use a cryptographically secure random generator

4. **Restrict access to production credentials**
   - Store production secrets in secure vaults (e.g., AWS Secrets Manager)
   - Limit access to production environment variables

5. **Use environment-specific values**
   - Use different credentials for development, staging, and production
   - Never use production credentials in development

---

## Setup Instructions

1. **Copy the example file**:
   ```bash
   cp server/.env.example server/.env
   ```

2. **Fill in your credentials**:
   - Replace all `your_*_here` placeholders with actual values
   - Ensure all required variables are set

3. **Verify configuration**:
   ```bash
   node server/check_env.js
   ```

4. **Start the server**:
   ```bash
   cd server
   npm start
   ```

---

## Troubleshooting

### Zoom Integration Issues

**Problem**: "Invalid SDK credentials" error
- **Solution**: Verify ZOOM_SDK_KEY and ZOOM_SDK_SECRET are correct
- **Check**: Ensure credentials are from a Meeting SDK app, not Server-to-Server OAuth

**Problem**: "Failed to create Zoom meeting"
- **Solution**: Verify ZOOM_API_KEY, ZOOM_API_SECRET, and ZOOM_ACCOUNT_ID
- **Check**: Ensure Server-to-Server OAuth app has required scopes (meeting:write)

**Problem**: "Signature verification failed"
- **Solution**: Verify ZOOM_WEBHOOK_SECRET matches your Zoom app configuration
- **Check**: Ensure webhook URL is publicly accessible

### Email Issues

**Problem**: "Authentication failed" for Gmail
- **Solution**: Use an app-specific password instead of your Gmail password
- **Steps**: Google Account → Security → 2-Step Verification → App passwords

### Database Issues

**Problem**: "Connection refused" for MongoDB
- **Solution**: Ensure MongoDB is running and MONGO_URI is correct
- **Check**: Test connection with `mongosh` CLI

---

## Additional Resources

- [Zoom API Documentation](https://developers.zoom.us/docs/api/)
- [Zoom Meeting SDK Documentation](https://developers.zoom.us/docs/meeting-sdk/)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [Gupshup WhatsApp API](https://www.gupshup.io/developer/docs)

---

**Last Updated**: 2024
**Version**: 2.0 (Zoom Migration)
