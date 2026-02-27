const validator = require('validator');
const xss = require('xss');

/**
 * Input Sanitization Middleware
 * 
 * Comprehensive input sanitization for all payment endpoints to prevent:
 * - SQL injection attacks
 * - XSS (Cross-Site Scripting) attacks
 * - NoSQL injection attacks
 * - Command injection
 * - Path traversal
 * 
 * Requirements: 5.7, 18.9
 */

/**
 * Sanitize a single string value
 * - Trims whitespace
 * - Escapes HTML entities
 * - Removes dangerous characters
 * 
 * @param {string} value - The string to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized string
 */
const sanitizeString = (value, options = {}) => {
  if (typeof value !== 'string') {
    return value;
  }

  let sanitized = value;

  // Trim whitespace
  if (options.trim !== false) {
    sanitized = sanitized.trim();
  }

  // Escape HTML to prevent XSS
  if (options.escapeHtml !== false) {
    sanitized = xss(sanitized, {
      whiteList: {}, // No HTML tags allowed
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style'],
    });
  }

  // Remove SQL injection patterns
  if (options.preventSqlInjection !== false) {
    // Remove common SQL injection patterns
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/gi,
      /(--|\;|\/\*|\*\/|xp_|sp_)/gi,
      /('|(\\')|(--)|(\#)|(\%)|(\+)|(=))/gi,
    ];

    // Check for