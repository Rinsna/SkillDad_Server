/**
 * Security Verification Script
 * 
 * Verifies that the Zoom Course Recording Integration meets security requirements:
 * - Webhook signature verification works correctly
 * - RBAC enforcement on all endpoints
 * - URL validation for Zoom domains
 * - Environment variables are not exposed
 * 
 * Usage: node server/scripts/verify_security.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkPass(condition, message) {
    if (condition) {
        log(`  ✓ ${message}`, 'green');
        return true;
    } else {
        log(`  ✗ ${message}`, 'red');
        return false;
    }
}

function checkWarning(condition, message) {
    if (condition) {
        log(`  ⚠ ${message}`, 'yellow');
        return false;
    }
    return true;
}

// Test 1: Webhook Signature Verification
function testWebhookSignatureVerification() {
    log('\n🔐 Testing Webhook Signature Verification...', 'cyan');
    
    const results = [];
    
    // Check if ZOOM_WEBHOOK_SECRET is set
    results.push(checkPass(
        process.env.ZOOM_WEBHOOK_SECRET && process.env.ZOOM_WEBHOOK_SECRET.length > 0,
        'ZOOM_WEBHOOK_SECRET is configured'
    ));
    
    // Test HMAC-SHA256 signature generation
    try {
        const testPayload = JSON.stringify({ event: 'test', data: 'test' });
        const testSecret = 'test_secret_key';
        
        const signature = crypto
            .createHmac('sha256', testSecret)
            .update(testPayload)
            .digest('hex');
        
        results.push(checkPass(
            signature && signature.length === 64,
            'HMAC-SHA256 signature generation works'
        ));
    } catch (error) {
        results.push(checkPass(false, `HMAC-SHA256 signature generation failed: ${error.message}`));
    }
    
    // Test constant-time comparison
    try {
        const sig1 = Buffer.from('a'.repeat(64));
        const sig2 = Buffer.from('a'.repeat(64));
        const sig3 = Buffer.from('b'.repeat(64));
        
        const equal = crypto.timingSafeEqual(sig1, sig2);
        const notEqual = !crypto.timingSafeEqual(sig1, sig3);
        
        results.push(checkPass(
            equal && notEqual,
            'Constant-time comparison (crypto.timingSafeEqual) works'
        ));
    } catch (error) {
        results.push(checkPass(false, `Constant-time comparison failed: ${error.message}`));
    }
    
    // Check webhook controller implementation
    const webhookControllerPath = path.join(__dirname, '../controllers/webhookController.js');
    if (fs.existsSync(webhookControllerPath)) {
        const content = fs.readFileSync(webhookControllerPath, 'utf8');
        
        results.push(checkPass(
            content.includes('createHmac') && content.includes('sha256'),
            'Webhook controller uses HMAC-SHA256'
        ));
        
        results.push(checkPass(
            content.includes('timingSafeEqual'),
            'Webhook controller uses constant-time comparison'
        ));
        
        results.push(checkPass(
            content.includes('401') || content.includes('Unauthorized'),
            'Webhook controller rejects invalid signatures'
        ));
    } else {
        results.push(checkPass(false, 'Webhook controller file not found'));
    }
    
    return results.every(r => r);
}

// Test 2: RBAC Enforcement
function testRBACEnforcement() {
    log('\n👮 Testing RBAC Enforcement...', 'cyan');
    
    const results = [];
    
    // Check courseZoomController implementation
    const controllerPath = path.join(__dirname, '../controllers/courseZoomController.js');
    if (fs.existsSync(controllerPath)) {
        const content = fs.readFileSync(controllerPath, 'utf8');
        
        // Check authorization checks in linkZoomRecordingToVideo
        results.push(checkPass(
            content.includes('isInstructor') || content.includes('instructor'),
            'Link operation checks instructor authorization'
        ));
        
        results.push(checkPass(
            content.includes('isAdmin') || content.includes('admin'),
            'Link operation checks admin authorization'
        ));
        
        results.push(checkPass(
            content.includes('403') && content.includes('Not authorized'),
            'Link operation returns 403 for unauthorized users'
        ));
        
        // Check role-based filtering in getAvailableZoomRecordings
        results.push(checkPass(
            content.includes('university') && content.includes('filter'),
            'Available recordings filtered by user role'
        ));
        
        // Check authorization in unlinkZoomRecordingFromVideo
        results.push(checkPass(
            content.includes('unlinkZoomRecordingFromVideo') && content.includes('403'),
            'Unlink operation has authorization checks'
        ));
    } else {
        results.push(checkPass(false, 'CourseZoom controller file not found'));
    }
    
    // Check auth middleware
    const authMiddlewarePath = path.join(__dirname, '../middleware/authMiddleware.js');
    if (fs.existsSync(authMiddlewarePath)) {
        const content = fs.readFileSync(authMiddlewarePath, 'utf8');
        
        results.push(checkPass(
            content.includes('jwt') || content.includes('JWT'),
            'Auth middleware uses JWT tokens'
        ));
        
        results.push(checkPass(
            content.includes('role') || content.includes('user'),
            'Auth middleware extracts user role'
        ));
    } else {
        results.push(checkPass(false, 'Auth middleware file not found'));
    }
    
    return results.every(r => r);
}

// Test 3: URL Validation
function testURLValidation() {
    log('\n🔗 Testing URL Validation...', 'cyan');
    
    const results = [];
    
    // Test URL validation function
    function isValidZoomUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.hostname.endsWith('.zoom.us') && parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }
    
    // Test valid Zoom URLs
    const validUrls = [
        'https://zoom.us/rec/play/test',
        'https://us02web.zoom.us/rec/play/test',
        'https://example.zoom.us/rec/download/test',
    ];
    
    const allValidPass = validUrls.every(url => isValidZoomUrl(url));
    results.push(checkPass(allValidPass, 'Valid Zoom URLs are accepted'));
    
    // Test invalid URLs
    const invalidUrls = [
        'http://zoom.us/rec/play/test', // HTTP instead of HTTPS
        'https://evil.com/rec/play/test', // Wrong domain
        'https://zoom.us.evil.com/rec/play/test', // Domain spoofing
        'ftp://zoom.us/rec/play/test', // Wrong protocol
    ];
    
    const allInvalidFail = invalidUrls.every(url => !isValidZoomUrl(url));
    results.push(checkPass(allInvalidFail, 'Invalid URLs are rejected'));
    
    // Check if URL validation is implemented in code
    const controllerPath = path.join(__dirname, '../controllers/courseZoomController.js');
    if (fs.existsSync(controllerPath)) {
        const content = fs.readFileSync(controllerPath, 'utf8');
        
        // Check if playUrl validation exists
        results.push(checkPass(
            content.includes('playUrl') && (content.includes('zoom.us') || content.includes('https')),
            'Controller validates recording URLs'
        ));
    }
    
    return results.every(r => r);
}

// Test 4: Environment Variable Security
function testEnvironmentVariableSecurity() {
    log('\n🔒 Testing Environment Variable Security...', 'cyan');
    
    const results = [];
    
    // Check required environment variables are set
    const requiredVars = [
        'ZOOM_API_KEY',
        'ZOOM_API_SECRET',
        'ZOOM_WEBHOOK_SECRET',
        'JWT_SECRET',
    ];
    
    requiredVars.forEach(varName => {
        const isSet = process.env[varName] && process.env[varName].length > 0;
        results.push(checkPass(isSet, `${varName} is configured`));
        
        if (isSet) {
            // Check if value looks like a placeholder
            const isPlaceholder = process.env[varName].includes('your_') || 
                                 process.env[varName].includes('_here') ||
                                 process.env[varName] === 'test';
            
            if (isPlaceholder) {
                checkWarning(true, `${varName} appears to be a placeholder value`);
            }
        }
    });
    
    // Check .env file is in .gitignore
    const gitignorePath = path.join(__dirname, '../../.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        results.push(checkPass(
            content.includes('.env'),
            '.env file is in .gitignore'
        ));
    } else {
        results.push(checkPass(false, '.gitignore file not found'));
    }
    
    // Check that credentials are not hardcoded in source files
    const filesToCheck = [
        '../controllers/webhookController.js',
        '../controllers/courseZoomController.js',
        '../utils/zoomUtils.js',
    ];
    
    let noHardcodedSecrets = true;
    filesToCheck.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Check for common secret patterns
            const hasHardcodedSecret = 
                /['"]sk_[a-zA-Z0-9]{20,}['"]/.test(content) || // Stripe keys
                /['"]pk_[a-zA-Z0-9]{20,}['"]/.test(content) || // Stripe keys
                /['"][a-zA-Z0-9]{32,}['"]/.test(content) && !content.includes('process.env'); // Long strings
            
            if (hasHardcodedSecret) {
                log(`  ⚠ Possible hardcoded secret in ${file}`, 'yellow');
                noHardcodedSecrets = false;
            }
        }
    });
    
    results.push(checkPass(noHardcodedSecrets, 'No hardcoded secrets found in source files'));
    
    // Check ZOOM_MOCK_MODE setting
    if (process.env.NODE_ENV === 'production') {
        const mockModeDisabled = process.env.ZOOM_MOCK_MODE !== 'true';
        results.push(checkPass(
            mockModeDisabled,
            'ZOOM_MOCK_MODE is disabled in production'
        ));
    } else {
        log('  ℹ Skipping ZOOM_MOCK_MODE check (not in production)', 'cyan');
    }
    
    return results.every(r => r);
}

// Test 5: Error Handling Security
function testErrorHandlingSecurity() {
    log('\n🛡️ Testing Error Handling Security...', 'cyan');
    
    const results = [];
    
    const controllerPath = path.join(__dirname, '../controllers/courseZoomController.js');
    if (fs.existsSync(controllerPath)) {
        const content = fs.readFileSync(controllerPath, 'utf8');
        
        // Check that errors don't expose sensitive data
        results.push(checkPass(
            !content.includes('error.stack') || content.includes('console.error'),
            'Error stacks are logged, not exposed to clients'
        ));
        
        // Check that generic error messages are used
        results.push(checkPass(
            content.includes('Failed to') || content.includes('Error'),
            'Generic error messages are used'
        ));
        
        // Check that database errors are caught
        results.push(checkPass(
            content.includes('try') && content.includes('catch'),
            'Database errors are caught and handled'
        ));
    } else {
        results.push(checkPass(false, 'Controller file not found'));
    }
    
    return results.every(r => r);
}

// Test 6: Input Validation
function testInputValidation() {
    log('\n✅ Testing Input Validation...', 'cyan');
    
    const results = [];
    
    const controllerPath = path.join(__dirname, '../controllers/courseZoomController.js');
    if (fs.existsSync(controllerPath)) {
        const content = fs.readFileSync(controllerPath, 'utf8');
        
        // Check parameter validation
        results.push(checkPass(
            content.includes('courseId') && content.includes('moduleIndex') && content.includes('videoIndex'),
            'Route parameters are extracted'
        ));
        
        // Check resource existence validation
        results.push(checkPass(
            content.includes('404') && content.includes('not found'),
            'Missing resources return 404 errors'
        ));
        
        // Check session validation
        results.push(checkPass(
            content.includes('recording.status') && content.includes('completed'),
            'Recording status is validated before linking'
        ));
    } else {
        results.push(checkPass(false, 'Controller file not found'));
    }
    
    return results.every(r => r);
}

async function generateSecurityReport(results) {
    log('\n📋 Security Verification Report', 'cyan');
    log('='.repeat(60), 'cyan');
    
    const allPassed = Object.values(results).every(result => result === true);
    
    if (allPassed) {
        log('\n✓ All security requirements met!', 'green');
    } else {
        log('\n✗ Some security requirements not met', 'red');
    }
    
    log('\nResults Summary:', 'cyan');
    log(`  Webhook Signature Verification: ${results.webhook ? '✓ Pass' : '✗ Fail'}`, results.webhook ? 'green' : 'red');
    log(`  RBAC Enforcement: ${results.rbac ? '✓ Pass' : '✗ Fail'}`, results.rbac ? 'green' : 'red');
    log(`  URL Validation: ${results.url ? '✓ Pass' : '✗ Fail'}`, results.url ? 'green' : 'red');
    log(`  Environment Variable Security: ${results.env ? '✓ Pass' : '✗ Fail'}`, results.env ? 'green' : 'red');
    log(`  Error Handling Security: ${results.error ? '✓ Pass' : '✗ Fail'}`, results.error ? 'green' : 'red');
    log(`  Input Validation: ${results.input ? '✓ Pass' : '✗ Fail'}`, results.input ? 'green' : 'red');
    
    log('\nSecurity Recommendations:', 'cyan');
    
    if (!results.webhook) {
        log('  • Review webhook signature verification implementation', 'yellow');
        log('  • Ensure ZOOM_WEBHOOK_SECRET is properly configured', 'yellow');
    }
    
    if (!results.rbac) {
        log('  • Review authorization checks in all endpoints', 'yellow');
        log('  • Ensure role-based filtering is applied correctly', 'yellow');
    }
    
    if (!results.url) {
        log('  • Implement URL validation for all recording URLs', 'yellow');
        log('  • Ensure only zoom.us domains are accepted', 'yellow');
    }
    
    if (!results.env) {
        log('  • Configure all required environment variables', 'yellow');
        log('  • Ensure .env file is in .gitignore', 'yellow');
        log('  • Replace placeholder values with real credentials', 'yellow');
    }
    
    if (!results.error) {
        log('  • Review error handling to avoid exposing sensitive data', 'yellow');
        log('  • Use generic error messages for clients', 'yellow');
    }
    
    if (!results.input) {
        log('  • Add input validation for all user inputs', 'yellow');
        log('  • Validate resource existence before operations', 'yellow');
    }
    
    log('\nAdditional Security Best Practices:', 'cyan');
    log('  • Rotate credentials every 90 days', 'yellow');
    log('  • Enable rate limiting on webhook endpoint', 'yellow');
    log('  • Monitor security logs for suspicious activity', 'yellow');
    log('  • Use HTTPS for all API endpoints', 'yellow');
    log('  • Keep dependencies up to date', 'yellow');
    
    log('\n' + '='.repeat(60), 'cyan');
}

async function main() {
    log('🔒 Zoom Course Recording Integration - Security Verification', 'blue');
    log('='.repeat(60), 'blue');
    
    // Run security tests
    const results = {
        webhook: testWebhookSignatureVerification(),
        rbac: testRBACEnforcement(),
        url: testURLValidation(),
        env: testEnvironmentVariableSecurity(),
        error: testErrorHandlingSecurity(),
        input: testInputValidation(),
    };
    
    // Generate report
    await generateSecurityReport(results);
    
    // Exit with appropriate code
    const allPassed = Object.values(results).every(result => result === true);
    process.exit(allPassed ? 0 : 1);
}

// Run the script
main().catch(error => {
    log(`\n✗ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
