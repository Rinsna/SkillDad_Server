const Razorpay = require('razorpay');
const crypto = require('crypto');

/**
 * RazorpayGatewayService - Main integration layer for Razorpay API
 * 
 * Handles all communication with Razorpay including:
 * - Order creation
 * - Payment signature verification
 * - Payment details retrieval
 * - Refund processing
 * 
 * Supports multiple payment methods:
 * - UPI (Google Pay, PhonePe, Paytm, BHIM, etc.)
 * - Cards (Credit/Debit - Visa, Mastercard, RuPay, Amex)
 * - Netbanking (All major Indian banks)
 * - Wallets (Paytm, PhonePe, Amazon Pay, etc.)
 */
class RazorpayGatewayService {
    /**
     * Initialize Razorpay Gateway Service
     * 
     * @param {Object} config - Gateway configuration
     * @param {string} config.keyId - Razorpay Key ID (can be exposed to client)
     * @param {string} config.keySecret - Razorpay Key Secret (server-side only)
     * @param {string} config.webhookSecret - Razorpay Webhook Secret for signature verification
     * @throws {Error} If required credentials are missing
     */
    constructor(config) {
        // Validate required credentials
        const keyId = config.keyId || process.env.RAZORPAY_KEY_ID;
        const keySecret = config.keySecret || process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            throw new Error('Razorpay credentials (keyId and keySecret) are required');
        }

        // Initialize Razorpay instance
        this.razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret
        });

        this.keyId = keyId;
        this.keySecret = keySecret;
        this.webhookSecret = config.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
        this.successUrl = process.env.RAZORPAY_SUCCESS_URL;
        this.cancelUrl = process.env.RAZORPAY_CANCEL_URL;

        console.log('✅ RazorpayGatewayService initialized successfully');
    }

    /**
     * Create a Razorpay Order
     * 
     * Orders must be created before initiating payment.
     * Amount must be in paise (smallest currency unit).
     * 
     * @param {Object} orderData - Order data
     * @param {number} orderData.amount - Amount in paise (e.g., ₹100 = 10000 paise)
     * @param {string} orderData.currency - Currency code (default: 'INR')
     * @param {string} orderData.receipt - Unique receipt ID for tracking
     * @param {Object} orderData.notes - Additional metadata (optional)
     * @returns {Promise<Object>} Order object with order_id, amount, currency, receipt
     * @throws {Error} If order creation fails
     */
    async createOrder(orderData) {
        try {
            const options = {
                amount: orderData.amount, // Amount in paise
                currency: orderData.currency || 'INR',
                receipt: orderData.receipt,
                notes: orderData.notes || {}
            };

            const order = await this.razorpay.orders.create(options);

            console.log(`✅ Razorpay order created: ${order.id}`);

            return {
                order_id: order.id,
                amount: order.amount,
                currency: order.currency,
                receipt: order.receipt,
                status: order.status
            };
        } catch (error) {
            console.error('❌ Razorpay order creation error:', error);
            throw new Error(`Failed to create Razorpay order: ${error.message}`);
        }
    }

    /**
     * Verify Payment Signature
     * 
     * CRITICAL SECURITY FUNCTION
     * Verifies that the payment callback is authentic using HMAC SHA256.
     * Uses crypto.timingSafeEqual to prevent timing attacks.
     * 
     * @param {Object} paymentData - Payment verification data
     * @param {string} paymentData.order_id - Razorpay order ID
     * @param {string} paymentData.payment_id - Razorpay payment ID
     * @param {string} paymentData.signature - Signature from Razorpay
     * @returns {boolean} True if signature is valid, false otherwise
     */
    verifyPaymentSignature(paymentData) {
        try {
            const { order_id, payment_id, signature } = paymentData;

            // Generate expected signature
            const text = `${order_id}|${payment_id}`;
            const expectedSignature = crypto
                .createHmac('sha256', this.keySecret)
                .update(text)
                .digest('hex');

            // Use timing-safe comparison to prevent timing attacks
            const isValid = crypto.timingSafeEqual(
                Buffer.from(expectedSignature, 'hex'),
                Buffer.from(signature, 'hex')
            );

            if (isValid) {
                console.log(`✅ Payment signature verified for order: ${order_id}`);
            } else {
                console.warn(`⚠️ Invalid payment signature for order: ${order_id}`);
            }

            return isValid;
        } catch (error) {
            console.error('❌ Payment signature verification error:', error);
            return false;
        }
    }

    /**
     * Fetch Payment Details
     * 
     * Retrieves complete payment information from Razorpay.
     * 
     * @param {string} paymentId - Razorpay payment ID
     * @returns {Promise<Object>} Payment details including status, method, amount
     * @throws {Error} If payment retrieval fails
     */
    async fetchPaymentDetails(paymentId) {
        try {
            const payment = await this.razorpay.payments.fetch(paymentId);

            return {
                id: payment.id,
                order_id: payment.order_id,
                status: payment.status,
                method: payment.method,
                amount: payment.amount,
                currency: payment.currency,
                email: payment.email,
                contact: payment.contact,
                created_at: payment.created_at,
                captured: payment.captured
            };
        } catch (error) {
            console.error('❌ Failed to fetch payment details:', error);
            throw new Error(`Failed to fetch payment details: ${error.message}`);
        }
    }

    /**
     * Verify Webhook Signature
     * 
     * Verifies that webhook events are authentic using HMAC SHA256.
     * 
     * @param {string} payload - Raw webhook payload (JSON string)
     * @param {string} signature - X-Razorpay-Signature header value
     * @returns {boolean} True if webhook signature is valid
     */
    verifyWebhookSignature(payload, signature) {
        try {
            const expectedSignature = crypto
                .createHmac('sha256', this.webhookSecret)
                .update(payload)
                .digest('hex');

            const isValid = crypto.timingSafeEqual(
                Buffer.from(expectedSignature, 'hex'),
                Buffer.from(signature, 'hex')
            );

            if (isValid) {
                console.log('✅ Webhook signature verified');
            } else {
                console.warn('⚠️ Invalid webhook signature');
            }

            return isValid;
        } catch (error) {
            console.error('❌ Webhook signature verification error:', error);
            return false;
        }
    }

    /**
     * Initiate Refund
     * 
     * Creates a refund for a captured payment.
     * Amount must be in paise (smallest currency unit).
     * 
     * @param {string} paymentId - Razorpay payment ID
     * @param {number} amount - Refund amount in paise (optional, full refund if not specified)
     * @param {Object} notes - Additional metadata (optional)
     * @returns {Promise<Object>} Refund object with refund_id and status
     * @throws {Error} If refund creation fails
     */
    async initiateRefund(paymentId, amount = null, notes = {}) {
        try {
            const refundData = {
                payment_id: paymentId,
                notes: notes
            };

            // If amount is specified, add it (otherwise full refund)
            if (amount !== null) {
                refundData.amount = amount;
            }

            const refund = await this.razorpay.payments.refund(paymentId, refundData);

            console.log(`✅ Refund initiated: ${refund.id}`);

            return {
                success: true,
                refund_id: refund.id,
                status: refund.status,
                amount: refund.amount,
                payment_id: refund.payment_id
            };
        } catch (error) {
            console.error('❌ Refund initiation error:', error);
            throw new Error(`Failed to initiate refund: ${error.message}`);
        }
    }

    /**
     * Fetch Order Details
     * 
     * Retrieves complete order information from Razorpay.
     * 
     * @param {string} orderId - Razorpay order ID
     * @returns {Promise<Object>} Order details
     * @throws {Error} If order retrieval fails
     */
    async fetchOrderDetails(orderId) {
        try {
            const order = await this.razorpay.orders.fetch(orderId);

            return {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                receipt: order.receipt,
                status: order.status,
                attempts: order.attempts,
                created_at: order.created_at
            };
        } catch (error) {
            console.error('❌ Failed to fetch order details:', error);
            throw new Error(`Failed to fetch order details: ${error.message}`);
        }
    }

    /**
     * Get Publishable Key
     * 
     * Returns the Razorpay Key ID which is safe to expose to the client.
     * This is used to initialize Razorpay checkout on the frontend.
     * 
     * @returns {string} Razorpay Key ID
     */
    getPublishableKey() {
        return this.keyId;
    }

    /**
     * Check Gateway Health
     * 
     * Verifies that the Razorpay service is accessible and credentials are valid.
     * 
     * @returns {Promise<Object>} Health status
     */
    async checkGatewayHealth() {
        try {
            // Try to fetch a non-existent order to verify API connectivity
            // This will fail but confirms credentials are valid
            await this.razorpay.orders.fetch('order_test_health_check');
        } catch (error) {
            // If error is "Bad request" it means API is accessible
            if (error.statusCode === 400 || error.error?.code === 'BAD_REQUEST_ERROR') {
                return {
                    available: true,
                    status: 'healthy',
                    message: 'Razorpay API is accessible'
                };
            }
            // Any other error means there's a problem
            return {
                available: false,
                status: 'unhealthy',
                message: error.message
            };
        }

        return {
            available: true,
            status: 'healthy'
        };
    }
}

module.exports = RazorpayGatewayService;
