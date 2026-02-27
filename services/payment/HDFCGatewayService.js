const crypto = require('crypto');
const axios = require('axios');

/**
 * HDFCGatewayService - Integration layer for HDFC SmartGateway
 * 
 * Handles all communication with HDFC SmartGateway including:
 * - Payment request signing
 * - Callback/Webhook signature verification
 * - Transaction status queries
 * - Settlement report fetching
 * 
 * Requirements: 1.1-1.8, 3.1-3.9, 10.3-10.5
 */
class HDFCGatewayService {
    /**
     * Initialize HDFC Gateway Service
     * 
     * @param {Object} config - Gateway configuration
     */
    constructor(config = {}) {
        this.merchantId = config.merchantId || process.env.HDFC_MERCHANT_ID;
        this.apiKey = config.apiKey || process.env.HDFC_API_KEY;
        this.apiSecret = config.apiSecret || process.env.HDFC_API_SECRET;
        this.gatewayUrl = config.gatewayUrl || process.env.HDFC_GATEWAY_URL || 'https://smartgateway.hdfcbank.com/api/v1';

        // Integrity check
        if (!this.merchantId || !this.apiSecret) {
            console.warn('[HDFC Service] Merchant ID or API Secret missing. Service will run in mock mode.');
            this.isMock = true;
        } else {
            this.isMock = false;
        }
    }

    /**
     * Generate HMAC-SHA256 signature for request payload
     * 
     * @param {Object} payload - Data to sign
     * @returns {string} Hex encoded signature
     */
    generateSignature(payload) {
        const data = JSON.stringify(payload);
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(data)
            .digest('hex');
    }

    /**
     * Verify signature from gateway callback/webhook
     * 
     * @param {Object} payload - Received data
     * @param {string} signature - Signature to verify
     * @returns {boolean} True if signature is valid
     */
    verifySignature(payload, signature) {
        if (!signature) return false;
        const expectedSignature = this.generateSignature(payload);
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    /**
     * Create a payment request for HDFC SmartGateway
     * 
     * @param {Object} transactionData - Transaction details
     * @returns {Promise<Object>} Payment URL and session data
     */
    async createPaymentRequest(transactionData) {
        if (this.isMock) {
            console.log('[HDFC Service] Mocking payment request for:', transactionData.transactionId);
            return {
                paymentUrl: `${this.gatewayUrl.replace('/api/v1', '')}/pay?session=mock_session_${Date.now()}`,
                transactionId: transactionData.transactionId,
                sessionId: `HDFC_SES_${Math.random().toString(36).substring(7).toUpperCase()}`,
            };
        }

        try {
            const payload = {
                merchant_id: this.merchantId,
                order_id: transactionData.transactionId,
                amount: Math.round(transactionData.amount * 100), // In paise
                currency: 'INR',
                customer_email: transactionData.customerEmail,
                customer_phone: transactionData.customerPhone,
                product_info: transactionData.productInfo || 'SkillDad Course',
                return_url: `${process.env.CLIENT_URL}/api/payment/callback`,
                timestamp: new Date().toISOString()
            };

            const signature = this.generateSignature(payload);

            const response = await axios.post(`${this.gatewayUrl}/checkout/session`, payload, {
                headers: {
                    'X-GATEWAY-KEY': this.apiKey,
                    'X-GATEWAY-SIGNATURE': signature,
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 second timeout as per Req 7.9
            });

            return {
                paymentUrl: response.data.payment_url,
                transactionId: transactionData.transactionId,
                sessionId: response.data.session_id,
                gatewayData: response.data
            };
        } catch (error) {
            console.error('[HDFC Service] Error creating payment session:', error.response?.data || error.message);
            throw new Error(`Gateway Error: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Fetch settlement report for a date range (for reconciliation)
     * 
     * @param {Date} startDate - Start of range
     * @param {Date} endDate - End of range
     * @returns {Promise<Array>} List of settlement records
     */
    async fetchSettlementReport(startDate, endDate) {
        if (this.isMock) {
            console.log('[HDFC Service] Mocking settlement report for:', startDate.toLocaleDateString(), '-', endDate.toLocaleDateString());
            return []; // Return empty in mock by default
        }

        try {
            const payload = {
                merchant_id: this.merchantId,
                start_date: startDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                timestamp: new Date().toISOString()
            };

            const signature = this.generateSignature(payload);

            const response = await axios.post(`${this.gatewayUrl}/reports/settlements`, payload, {
                headers: {
                    'X-GATEWAY-KEY': this.apiKey,
                    'X-GATEWAY-SIGNATURE': signature,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.settlements || [];
        } catch (error) {
            console.error('[HDFC Service] Error fetching settlement report:', error.response?.data || error.message);
            throw new Error('Failed to fetch settlement report from HDFC Gateway');
        }
    }

    /**
     * Query transaction status
     * 
     * @param {string} transactionId - Internal transaction ID
     * @returns {Promise<Object>} Transaction status data
     */
    async queryTransactionStatus(transactionId) {
        if (this.isMock) {
            return { status: 'pending', transactionId };
        }

        try {
            const response = await axios.get(`${this.gatewayUrl}/transactions/${transactionId}`, {
                headers: {
                    'X-GATEWAY-KEY': this.apiKey,
                    'merchant-id': this.merchantId
                }
            });

            return response.data;
        } catch (error) {
            console.error('[HDFC Service] Error querying transaction:', error.response?.data || error.message);
            throw new Error('Failed to query transaction status from HDFC Gateway');
        }
    }
}

module.exports = HDFCGatewayService;
