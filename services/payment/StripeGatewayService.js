const Stripe = require('stripe');

/**
 * StripeGatewayService - Main integration layer for Stripe API
 * 
 * Handles all communication with Stripe including:
 * - Checkout session creation
 * - Webhook event processing
 * - Refund processing
 */
class StripeGatewayService {
    /**
     * Initialize Stripe Gateway Service
     * 
     * @param {Object} config - Gateway configuration
     * @param {string} config.secretKey - Stripe Secret Key
     * @param {string} config.publishableKey - Stripe Publishable Key
     * @param {string} config.webhookSecret - Stripe Webhook Secret
     */
    constructor(config) {
        this.stripe = new Stripe(config.secretKey || process.env.STRIPE_SECRET_KEY);
        this.publishableKey = config.publishableKey || process.env.STRIPE_PUBLISHABLE_KEY;
        this.webhookSecret = config.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
        this.successUrl = process.env.STRIPE_SUCCESS_URL;
        this.cancelUrl = process.env.STRIPE_CANCEL_URL;
    }

    /**
     * Create a Stripe Checkout Session
     * 
     * @param {Object} transactionData - Transaction data
     * @returns {Promise<Object>} Session object with URL
     */
    async createPaymentRequest(transactionData) {
        try {
            const session = await this.stripe.checkout.sessions.create({
                automatic_payment_methods: {
                    enabled: true,
                },
                line_items: [
                    {
                        price_data: {
                            currency: transactionData.currency.toLowerCase() || 'inr',
                            product_data: {
                                name: transactionData.productInfo || 'SkillDad Course',
                                metadata: {
                                    courseId: String(transactionData.courseId),
                                }
                            },
                            unit_amount: Math.round((transactionData.amount + (transactionData.gstAmount || 0)) * 100), // Stripe expects amount in subunits (cents/paise)
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${this.successUrl}&transactionId=${transactionData.transactionId}`,
                cancel_url: `${this.cancelUrl}&transactionId=${transactionData.transactionId}`,
                client_reference_id: String(transactionData.transactionId),
                customer_email: transactionData.customerEmail,
                metadata: {
                    transactionId: String(transactionData.transactionId),
                    studentId: String(transactionData.studentId),
                    courseId: String(transactionData.courseId),
                },
            });

            return {
                paymentUrl: session.url,
                transactionId: transactionData.transactionId,
                sessionId: session.id,
            };
        } catch (error) {
            console.error('Stripe session creation error:', error);
            throw new Error(`Failed to create Stripe payment request: ${error.message}`);
        }
    }

    /**
     * Verify Stripe Webhook Signature
     * 
     * @param {string} payload - Raw request body
     * @param {string} signature - Stripe signature header
     * @returns {Object} Verified event
     */
    verifyWebhook(payload, signature) {
        try {
            return this.stripe.webhooks.constructEvent(
                payload,
                signature,
                this.webhookSecret
            );
        } catch (error) {
            console.error('Webhook signature verification failed:', error.message);
            throw new Error(`Webhook Error: ${error.message}`);
        }
    }

    /**
     * Retrieve session details
     * 
     * @param {string} sessionId - Stripe session ID
     */
    async getSession(sessionId) {
        try {
            if (sessionId.startsWith('pi_')) {
                const intent = await this.stripe.paymentIntents.retrieve(sessionId);
                return {
                    id: intent.id,
                    payment_status: intent.status === 'succeeded' ? 'paid' : 'unpaid',
                    payment_intent: intent.id,
                    client_reference_id: intent.metadata?.transactionId
                };
            }
            return await this.stripe.checkout.sessions.retrieve(sessionId);
        } catch (error) {
            throw new Error(`Failed to retrieve Stripe session: ${error.message}`);
        }
    }

    /**
     * Initiate refund
     * 
     * @param {string} paymentIntentId - Stripe Payment Intent ID
     * @param {number} amount - Amount in subunits (cents/paise)
     */
    async initiateRefund(paymentIntentId, amount) {
        try {
            const refund = await this.stripe.refunds.create({
                payment_intent: paymentIntentId,
                amount: Math.round(amount * 100),
            });
            return {
                success: refund.status === 'succeeded',
                refundId: refund.id,
                status: refund.status
            };
        } catch (error) {
            throw new Error(`Failed to initiate Stripe refund: ${error.message}`);
        }
    }

    /**
     * Create a Stripe Payment Intent (for Elements integration)
     * 
     * @param {Object} transactionData - Transaction data
     * @returns {Promise<Object>} Payment Intent object with client_secret
     */
    async createPaymentIntent(transactionData) {
        try {
            const intent = await this.stripe.paymentIntents.create({
                amount: Math.round((transactionData.amount + (transactionData.gstAmount || 0)) * 100),
                currency: transactionData.currency.toLowerCase() || 'inr',
                automatic_payment_methods: {
                    enabled: true,
                },
                metadata: {
                    transactionId: String(transactionData.transactionId),
                    studentId: String(transactionData.studentId),
                    courseId: String(transactionData.courseId),
                },
                description: `Payment for ${transactionData.productInfo || 'SkillDad Course'}`,
                receipt_email: transactionData.customerEmail,
            });

            return {
                clientSecret: intent.client_secret,
                transactionId: transactionData.transactionId,
                intentId: intent.id,
            };
        } catch (error) {
            console.error('Stripe PaymentIntent creation error:', error);
            throw new Error(`Failed to create Stripe PaymentIntent: ${error.message}`);
        }
    }

    /**
     * Check health (Stub for Stripe as it's a managed service)
     */
    async checkGatewayHealth() {
        return { available: true, status: 'healthy' };
    }
}

module.exports = StripeGatewayService;
