# Payment Routes Integration Tests

## Overview

This directory contains comprehensive integration tests for the HDFC SmartGateway payment API routes. The tests verify the complete payment flow including middleware execution, signature verification, and database operations.

## Test Coverage

### Test Suites

1. **Payment Initiation Flow End-to-End**
   - Valid payment initiation
   - Discount code application
   - Invalid discount codes
   - Non-existent courses
   - Duplicate enrollments
   - Amount validation (min/max limits)
   - GST calculation

2. **Callback Handling with Signature Verification**
   - Successful payment callbacks
   - Invalid signature rejection
   - Failed payment handling
   - Session expiration
   - Idempotent callbacks (duplicate handling)
   - Non-existent transactions

3. **Webhook Processing**
   - Valid webhook processing
   - Invalid signature rejection
   - Idempotent webhooks
   - Enrollment activation
   - Non-existent transactions

4. **Rate Limiting Enforcement**
   - Payment initiation rate limits (5 req/min)
   - Status check rate limits (10 req/min)
   - Per-user rate limit isolation

5. **CSRF Protection**
   - CSRF token generation
   - CSRF token validation
   - Callback/webhook exemption from CSRF

6. **Authentication and Authorization**
   - Unauthenticated request rejection
   - Invalid token rejection
   - Student role authorization
   - Admin role authorization
   - Role-based access control
   - Payment history access control

## Requirements Validated

- **Requirement 18.3**: Integration tests for complete payment flows
- **Requirement 18.5**: Tests for webhook handling with various payment status values
- **Requirement 18.9**: Security tests for injection attacks and invalid signatures

## Running the Tests

### Prerequisites

1. Install dependencies:
   ```bash
   cd server
   npm install
   ```

2. Ensure MongoDB is running (or use MongoDB Memory Server)

3. Set up test environment variables in `.env.test` or use defaults from `setup.js`

### Run All Tests

```bash
npm test
```

### Run Only Integration Tests

```bash
npm test -- paymentRoutes.integration.test.js
```

### Run with Coverage

```bash
npm test -- --coverage
```

### Run in Watch Mode

```bash
npm test -- --watch
```

### Run with Verbose Output

```bash
npm test -- --verbose
```

## Test Database

The tests use a separate test database to avoid affecting development or production data:

- Default: `mongodb://localhost:27017/skilldad-test`
- Override with `MONGO_URI_TEST` environment variable

The test database is automatically cleaned up after each test run.

## Mocked Services

The following services are mocked to avoid external dependencies:

- **Redis**: Rate limiting uses in-memory store in tests
- **Email Service**: Email sending is mocked
- **Socket Service**: WebSocket notifications are mocked
- **Monitoring Service**: Metrics tracking is mocked

## Test Data

Each test creates its own isolated test data:

- Test users (student, admin, finance roles)
- Test courses
- Test transactions
- Gateway configuration

All test data is cleaned up after each test using `afterEach` hooks.

## Debugging Tests

### Enable Console Output

Comment out the console mocking in `setup.js`:

```javascript
// global.console = {
//   ...console,
//   log: jest.fn(),
// };
```

### Increase Timeout

For slow tests, increase the timeout:

```javascript
jest.setTimeout(60000); // 60 seconds
```

### Run Single Test

Use `.only` to run a single test:

```javascript
it.only('should successfully initiate payment', async () => {
  // test code
});
```

## Common Issues

### MongoDB Connection Errors

If you see MongoDB connection errors:

1. Ensure MongoDB is running: `mongod`
2. Check connection string in `MONGO_URI_TEST`
3. Use MongoDB Memory Server for isolated testing

### Rate Limit Tests Failing

Rate limit tests may fail if:

1. Redis is caching limits from previous runs
2. Tests are running too slowly

Solution: Increase test timeout or clear Redis between tests

### Signature Verification Failures

Ensure environment variables are set correctly:

- `HDFC_API_SECRET` must match between test setup and service
- Signature generation must use the same secret

## Contributing

When adding new tests:

1. Follow the existing test structure
2. Use descriptive test names
3. Clean up test data in `afterEach`
4. Mock external services
5. Test both success and failure scenarios
6. Verify database state changes

## Test Maintenance

- Update tests when API contracts change
- Add tests for new features
- Remove tests for deprecated features
- Keep test data minimal and focused
- Ensure tests are independent and can run in any order
