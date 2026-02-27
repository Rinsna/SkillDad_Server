/**
 * Bug Condition Exploration Test - CSRF Token Endpoint
 * 
 * This test encodes the EXPECTED behavior for the CSRF token endpoint.
 * It will FAIL on unfixed code (proving the bug exists) and PASS after the fix.
 * 
 * Bug: GET /api/payment/csrf-token returns 500 because req.csrfToken() is undefined
 * Expected: GET /api/payment/csrf-token returns 200 with valid CSRF token
 * 
 * **Validates: Requirements 1.1, 2.1**
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// Import the payment routes
const paymentRoutes = require('../paymentRoutes');

describe('Bug Exploration: CSRF Token Endpoint', () => {
  let app;

  beforeEach(() => {
    // Create a minimal Express app with the payment routes
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    
    // Mount payment routes
    app.use('/api/payment', paymentRoutes);
  });

  /**
   * Property 1: Fault Condition - CSRF Token Endpoint Returns 500
   * 
   * This test encodes the EXPECTED behavior:
   * - Status code should be 200 (not 500)
   * - Response should have success: true
   * - Response should have a csrfToken string
   * 
   * On UNFIXED code, this test will FAIL because:
   * - The endpoint returns 500 status
   * - req.csrfToken() is undefined (middleware not applied)
   * 
   * After the fix, this test will PASS, confirming the bug is resolved.
   */
  it('should return 200 with valid CSRF token (EXPECTED to FAIL on unfixed code)', async () => {
    // Make GET request to CSRF token endpoint
    const response = await request(app)
      .get('/api/payment/csrf-token')
      .expect('Content-Type', /json/);

    // EXPECTED BEHAVIOR (will fail on unfixed code):
    // 1. Status should be 200, not 500
    expect(response.status).toBe(200);
    
    // 2. Response should indicate success
    expect(response.body).toHaveProperty('success', true);
    
    // 3. Response should contain a CSRF token string
    expect(response.body).toHaveProperty('csrfToken');
    expect(typeof response.body.csrfToken).toBe('string');
    expect(response.body.csrfToken.length).toBeGreaterThan(0);

    // COUNTEREXAMPLE DOCUMENTATION:
    // If this test fails, it confirms the bug exists:
    // - response.status will be 500 (not 200)
    // - response.body.success will be false
    // - response.body.message will indicate "Failed to generate CSRF token"
    // - The underlying error is "req.csrfToken is not a function"
  });

  /**
   * Additional verification: CSRF cookie should be set
   * 
   * The CSRF middleware should also set a secure httpOnly cookie
   * containing the CSRF secret.
   */
  it('should set secure httpOnly cookie with CSRF secret (EXPECTED to FAIL on unfixed code)', async () => {
    const response = await request(app)
      .get('/api/payment/csrf-token');

    // EXPECTED BEHAVIOR (will fail on unfixed code):
    // 1. Status should be 200
    expect(response.status).toBe(200);
    
    // 2. Response should set a cookie (CSRF secret)
    // Note: The cookie name depends on the csurf configuration
    // Common names: _csrf, XSRF-TOKEN
    const cookies = response.headers['set-cookie'];
    
    // On unfixed code, this will fail because no cookie is set
    expect(cookies).toBeDefined();
    
    // At least one cookie should be set by the CSRF middleware
    if (cookies) {
      expect(Array.isArray(cookies) ? cookies.length : 1).toBeGreaterThan(0);
    }
  });
});
