const request = require('supertest');
const crypto = require('crypto');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = require('../server');
const LiveSession = require('../models/liveSessionModel');

/**
 * Webhook Error Handling Tests
 * 
 * Tests Requirement 10.6:
 * - Webhook signature verification failure handling
 * - Return 401 for invalid signatures
 * - Security logging for failed verifications
 */

describe('Zoom Webhook - Error Handling', () => {
  const WEBHOOK_SECRET = 'test-webhook-secret';
  let liveSession;

  beforeAll(async () => {
    // Connect to database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
    process.env.ZOOM_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterAll(async () => {
    // Clean up test data
    await LiveSession.deleteMany({ topic: 'Test Session' });
    
    delete process.env.ZOOM_WEBHOOK_SECRET;
    
    // Close database connection
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await LiveSession.deleteMany({ topic: 'Test Session' });

    // Create test live session
    liveSession = await LiveSession.create({
      topic: 'Test Session',
      startTime: new Date(),
      endTime: new Date(),
      status: 'ended',
      zoom: {
        meetingId: '123456789'
      },
      recording: {
        status: 'pending'
      }
    });
  });

  /**
   * Helper function to generate valid webhook signature
   */
  const generateSignature = (timestamp, body) => {
    const message = `v0:${timestamp}:${JSON.stringify(body)}`;
    const hash = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(message)
      .digest('hex');
    return `v0=${hash}`;
  };

  describe('Requirement 10.6: Webhook signature verification failure', () => {
    it('should return 401 for missing signature header', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = {
        event: 'recording.completed',
        payload: {
          object: {
            id: 123456789,
            uuid: '123456789',
            recording_files: []
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-request-timestamp', timestamp)
        // Missing x-zm-signature header
        .send(body);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid webhook signature');
    });

    it('should return 401 for missing timestamp header', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = {
        event: 'recording.completed',
        payload: {
          object: {
            id: 123456789,
            uuid: '123456789',
            recording_files: []
          }
        }
      };

      const signature = generateSignature(timestamp, body);

      const response = await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-signature', signature)
        // Missing x-zm-request-timestamp header
        .send(body);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid webhook signature');
    });

    it('should return 401 for invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = {
        event: 'recording.completed',
        payload: {
          object: {
            id: 123456789,
            uuid: '123456789',
            recording_files: []
          }
        }
      };

      const invalidSignature = 'v0=invalid_signature_hash';

      const response = await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-signature', invalidSignature)
        .set('x-zm-request-timestamp', timestamp)
        .send(body);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid webhook signature');
    });

    it('should return 401 for tampered payload', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const originalBody = {
        event: 'recording.completed',
        payload: {
          object: {
            id: 123456789,
            uuid: '123456789',
            recording_files: []
          }
        }
      };

      // Generate signature for original body
      const signature = generateSignature(timestamp, originalBody);

      // Tamper with the body
      const tamperedBody = {
        ...originalBody,
        event: 'recording.deleted' // Changed event
      };

      const response = await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-signature', signature)
        .set('x-zm-request-timestamp', timestamp)
        .send(tamperedBody);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid webhook signature');
    });

    it('should return 401 for expired timestamp (replay attack prevention)', async () => {
      // Timestamp from 10 minutes ago (should be rejected)
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
      const body = {
        event: 'recording.completed',
        payload: {
          object: {
            id: 123456789,
            uuid: '123456789',
            recording_files: []
          }
        }
      };

      const signature = generateSignature(oldTimestamp, body);

      const response = await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-signature', signature)
        .set('x-zm-request-timestamp', oldTimestamp)
        .send(body);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid webhook signature');
    });

    it('should accept valid signature with current timestamp', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = {
        event: 'recording.completed',
        payload: {
          object: {
            id: parseInt(liveSession.zoom.meetingId),
            uuid: liveSession.zoom.meetingId,
            recording_files: [
              {
                id: 'file-1',
                recording_type: 'shared_screen_with_speaker_view',
                file_type: 'MP4',
                file_size: 104857600,
                play_url: 'https://zoom.us/rec/play/test123',
                download_url: 'https://zoom.us/rec/download/test123',
                recording_start: new Date().toISOString(),
                recording_end: new Date(Date.now() + 3600000).toISOString()
              }
            ]
          }
        }
      };

      const signature = generateSignature(timestamp, body);

      const response = await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-signature', signature)
        .set('x-zm-request-timestamp', timestamp)
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should handle URL validation event correctly', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const plainToken = 'test-plain-token-123';
      const body = {
        event: 'endpoint.url_validation',
        payload: {
          plainToken: plainToken
        }
      };

      const signature = generateSignature(timestamp, body);

      const response = await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-signature', signature)
        .set('x-zm-request-timestamp', timestamp)
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body.plainToken).toBe(plainToken);
      expect(response.body.encryptedToken).toBeDefined();
      
      // Verify encrypted token is correct
      const expectedEncryptedToken = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(plainToken)
        .digest('hex');
      expect(response.body.encryptedToken).toBe(expectedEncryptedToken);
    });

    it('should return 400 for URL validation without plainToken', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = {
        event: 'endpoint.url_validation',
        payload: {}
      };

      const signature = generateSignature(timestamp, body);

      const response = await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-signature', signature)
        .set('x-zm-request-timestamp', timestamp)
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Missing plainToken');
    });
  });

  describe('Webhook processing error handling', () => {
    it('should return 200 and log warning when session not found', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = {
        event: 'recording.completed',
        payload: {
          object: {
            id: 999999999, // Non-existent meeting ID
            uuid: '999999999',
            recording_files: [
              {
                id: 'file-1',
                recording_type: 'shared_screen_with_speaker_view',
                file_type: 'MP4',
                file_size: 104857600,
                play_url: 'https://zoom.us/rec/play/test123',
                download_url: 'https://zoom.us/rec/download/test123',
                recording_start: new Date().toISOString(),
                recording_end: new Date(Date.now() + 3600000).toISOString()
              }
            ]
          }
        }
      };

      const signature = generateSignature(timestamp, body);

      const response = await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-signature', signature)
        .set('x-zm-request-timestamp', timestamp)
        .send(body);

      // Should return 200 to acknowledge receipt even if session not found
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('no matching session found');
    });

    it('should return 400 when recording.completed event has no meeting ID', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = {
        event: 'recording.completed',
        payload: {
          object: {
            // Missing id field
            uuid: '123456789',
            recording_files: []
          }
        }
      };

      const signature = generateSignature(timestamp, body);

      const response = await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-signature', signature)
        .set('x-zm-request-timestamp', timestamp)
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Missing meeting ID');
    });

    it('should acknowledge unhandled event types', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = {
        event: 'meeting.started',
        payload: {
          object: {
            id: 123456789
          }
        }
      };

      const signature = generateSignature(timestamp, body);

      const response = await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-signature', signature)
        .set('x-zm-request-timestamp', timestamp)
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Webhook received');
    });
  });

  describe('Security logging', () => {
    it('should log security warning for signature verification failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = {
        event: 'recording.completed',
        payload: {
          object: {
            id: 123456789,
            uuid: '123456789',
            recording_files: []
          }
        }
      };

      const invalidSignature = 'v0=invalid_signature';

      await request(app)
        .post('/api/webhooks/zoom')
        .set('x-zm-signature', invalidSignature)
        .set('x-zm-request-timestamp', timestamp)
        .send(body);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Zoom Webhook] SECURITY WARNING'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });
  });
});
