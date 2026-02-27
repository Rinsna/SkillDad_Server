const crypto = require('crypto');
const { verifyWebhookSignature } = require('./webhookController');

describe('Zoom Webhook Controller', () => {
  const originalEnv = process.env.ZOOM_WEBHOOK_SECRET;
  const testSecret = 'test_webhook_secret_12345';

  beforeAll(() => {
    process.env.ZOOM_WEBHOOK_SECRET = testSecret;
  });

  afterAll(() => {
    process.env.ZOOM_WEBHOOK_SECRET = originalEnv;
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid webhook signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = { event: 'recording.completed', payload: { object: { id: '123' } } };
      const message = `v0:${timestamp}:${JSON.stringify(body)}`;
      
      const hash = crypto
        .createHmac('sha256', testSecret)
        .update(message)
        .digest('hex');
      
      const signature = `v0=${hash}`;
      
      const result = verifyWebhookSignature(signature, timestamp, body);
      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = { event: 'recording.completed' };
      const invalidSignature = 'v0=invalid_signature_hash';
      
      const result = verifyWebhookSignature(invalidSignature, timestamp, body);
      expect(result).toBe(false);
    });

    it('should reject old timestamps (replay attack prevention)', () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 6+ minutes old
      const body = { event: 'recording.completed' };
      const message = `v0:${oldTimestamp}:${JSON.stringify(body)}`;
      
      const hash = crypto
        .createHmac('sha256', testSecret)
        .update(message)
        .digest('hex');
      
      const signature = `v0=${hash}`;
      
      const result = verifyWebhookSignature(signature, oldTimestamp, body);
      expect(result).toBe(false);
    });

    it('should reject missing signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = { event: 'recording.completed' };
      
      const result = verifyWebhookSignature(null, timestamp, body);
      expect(result).toBe(false);
    });

    it('should reject missing timestamp', () => {
      const body = { event: 'recording.completed' };
      const signature = 'v0=some_hash';
      
      const result = verifyWebhookSignature(signature, null, body);
      expect(result).toBe(false);
    });

    it('should handle missing webhook secret', () => {
      const originalSecret = process.env.ZOOM_WEBHOOK_SECRET;
      delete process.env.ZOOM_WEBHOOK_SECRET;
      
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = { event: 'recording.completed' };
      const signature = 'v0=some_hash';
      
      const result = verifyWebhookSignature(signature, timestamp, body);
      expect(result).toBe(false);
      
      process.env.ZOOM_WEBHOOK_SECRET = originalSecret;
    });
  });
});
