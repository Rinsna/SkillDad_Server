// Mock environment variables BEFORE requiring the module
process.env.ZOOM_SDK_KEY = 'test_sdk_key_12345';
process.env.ZOOM_SDK_SECRET = 'test_sdk_secret_67890';
process.env.ZOOM_API_KEY = 'test_api_key';
process.env.ZOOM_API_SECRET = 'test_api_secret';
process.env.ZOOM_ACCOUNT_ID = 'test_account_id';
process.env.ZOOM_ENCRYPTION_KEY = 'test_encryption_key_for_aes_256_encryption';

// Mock Redis
jest.mock('./redisCache');

const jwt = require('jsonwebtoken');
const { generateZoomSignature } = require('./zoomUtils');
const redisCache = require('./redisCache');

describe('generateZoomSignature', () => {
  let mockRedisClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Redis client
    mockRedisClient = {
      get: jest.fn(),
      setEx: jest.fn()
    };
    
    redisCache.getRedis.mockReturnValue(mockRedisClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Input Validation', () => {
    test('should throw error if meeting number is missing', async () => {
      await expect(generateZoomSignature(null, 0)).rejects.toThrow('Meeting number is required');
    });

    test('should throw error if role is invalid', async () => {
      await expect(generateZoomSignature('123456789', 2)).rejects.toThrow('Role must be 0 (participant) or 1 (host)');
      await expect(generateZoomSignature('123456789', -1)).rejects.toThrow('Role must be 0 (participant) or 1 (host)');
    });

    // Note: SDK credentials are validated at module load time, so we can't test missing credentials
    // in this test suite without reloading the module
  });

  describe('JWT Signature Generation', () => {
    test('should generate valid JWT signature with correct payload', async () => {
      const meetingNumber = '123456789';
      const role = 1;
      
      const signature = await generateZoomSignature(meetingNumber, role);
      
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      
      // Decode and verify JWT
      const decoded = jwt.verify(signature, process.env.ZOOM_SDK_SECRET);
      
      expect(decoded.sdkKey).toBe('test_sdk_key_12345');
      expect(decoded.mn).toBe(meetingNumber);
      expect(decoded.role).toBe(role);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.tokenExp).toBe(decoded.exp);
    });

    test('should set expiration to 2 hours from generation time', async () => {
      const beforeTime = Math.floor(Date.now() / 1000);
      const signature = await generateZoomSignature('123456789', 0);
      const afterTime = Math.floor(Date.now() / 1000);
      
      const decoded = jwt.verify(signature, process.env.ZOOM_SDK_SECRET);
      
      const expectedExp = beforeTime + (2 * 60 * 60);
      const maxExpectedExp = afterTime + (2 * 60 * 60);
      
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExp);
      expect(decoded.exp).toBeLessThanOrEqual(maxExpectedExp);
      
      // Verify it's at least 2 hours (7200 seconds)
      const timeToExpiry = decoded.exp - decoded.iat;
      expect(timeToExpiry).toBe(7200);
    });

    test('should include meeting number and role in payload', async () => {
      const meetingNumber = '987654321';
      const role = 0;
      
      const signature = await generateZoomSignature(meetingNumber, role);
      const decoded = jwt.verify(signature, process.env.ZOOM_SDK_SECRET);
      
      expect(decoded.mn).toBe(meetingNumber);
      expect(decoded.role).toBe(role);
    });

    test('should work with role 0 (participant)', async () => {
      const signature = await generateZoomSignature('123456789', 0);
      const decoded = jwt.verify(signature, process.env.ZOOM_SDK_SECRET);
      
      expect(decoded.role).toBe(0);
    });

    test('should work with role 1 (host)', async () => {
      const signature = await generateZoomSignature('123456789', 1);
      const decoded = jwt.verify(signature, process.env.ZOOM_SDK_SECRET);
      
      expect(decoded.role).toBe(1);
    });
  });

  describe('Redis Caching', () => {
    test('should return cached signature if available', async () => {
      const cachedSignature = 'cached_jwt_token_12345';
      mockRedisClient.get.mockResolvedValue(cachedSignature);
      
      const result = await generateZoomSignature('123456789', 1, 'session123', 'user456');
      
      expect(result).toBe(cachedSignature);
      expect(mockRedisClient.get).toHaveBeenCalledWith('zoom:sig:session123:user456:1');
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
    });

    test('should cache new signature with correct key format and TTL', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const signature = await generateZoomSignature('123456789', 0, 'session789', 'user123');
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'zoom:sig:session789:user123:0',
        3600, // 1 hour in seconds
        signature
      );
    });

    test('should not use cache if sessionId is not provided', async () => {
      const signature = await generateZoomSignature('123456789', 1);
      
      expect(mockRedisClient.get).not.toHaveBeenCalled();
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
      expect(signature).toBeDefined();
    });

    test('should not use cache if userId is not provided', async () => {
      const signature = await generateZoomSignature('123456789', 1, 'session123');
      
      expect(mockRedisClient.get).not.toHaveBeenCalled();
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
      expect(signature).toBeDefined();
    });

    test('should handle Redis cache read errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));
      
      const signature = await generateZoomSignature('123456789', 1, 'session123', 'user456');
      
      expect(signature).toBeDefined();
      // Should still generate a new signature
      const decoded = jwt.verify(signature, process.env.ZOOM_SDK_SECRET);
      expect(decoded.mn).toBe('123456789');
    });

    test('should handle Redis cache write errors gracefully', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setEx.mockRejectedValue(new Error('Redis write failed'));
      
      const signature = await generateZoomSignature('123456789', 1, 'session123', 'user456');
      
      expect(signature).toBeDefined();
      // Should still return a valid signature
      const decoded = jwt.verify(signature, process.env.ZOOM_SDK_SECRET);
      expect(decoded.mn).toBe('123456789');
    });

    test('should handle Redis being unavailable', async () => {
      redisCache.getRedis.mockReturnValue(null);
      
      const signature = await generateZoomSignature('123456789', 1, 'session123', 'user456');
      
      expect(signature).toBeDefined();
      const decoded = jwt.verify(signature, process.env.ZOOM_SDK_SECRET);
      expect(decoded.mn).toBe('123456789');
    });

    test('should use different cache keys for different roles', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      await generateZoomSignature('123456789', 0, 'session123', 'user456');
      await generateZoomSignature('123456789', 1, 'session123', 'user456');
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'zoom:sig:session123:user456:0',
        expect.any(Number),
        expect.any(String)
      );
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'zoom:sig:session123:user456:1',
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  describe('Security', () => {
    test('should not expose SDK secret in signature', async () => {
      const signature = await generateZoomSignature('123456789', 1);
      
      // Signature should not contain the secret in plain text
      expect(signature).not.toContain(process.env.ZOOM_SDK_SECRET);
    });

    test('should generate different signatures for different meeting numbers', async () => {
      const sig1 = await generateZoomSignature('111111111', 1);
      const sig2 = await generateZoomSignature('222222222', 1);
      
      expect(sig1).not.toBe(sig2);
    });

    test('should generate different signatures for different roles', async () => {
      const sig1 = await generateZoomSignature('123456789', 0);
      const sig2 = await generateZoomSignature('123456789', 1);
      
      expect(sig1).not.toBe(sig2);
    });
  });
});

// Mock axios for API calls
jest.mock('axios');
const axios = require('axios');
const { getZoomRecordings, getZoomAccessToken } = require('./zoomUtils');

describe('getZoomRecordings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    test('should throw error if meeting ID is missing', async () => {
      await expect(getZoomRecordings(null)).rejects.toThrow('Meeting ID is required');
      await expect(getZoomRecordings('')).rejects.toThrow('Meeting ID is required');
    });
  });

  describe('Recording Retrieval', () => {
    test('should return empty array when no recordings exist', async () => {
      // Mock access token
      axios.post.mockResolvedValue({
        data: { access_token: 'test_token' }
      });

      // Mock recordings API response with no recordings
      axios.get.mockResolvedValue({
        data: {
          recording_files: []
        }
      });

      const result = await getZoomRecordings('123456789');

      expect(result).toEqual([]);
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.zoom.us/v2/meetings/123456789/recordings',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test_token'
          })
        })
      );
    });

    test('should return empty array when recording_files is undefined', async () => {
      axios.post.mockResolvedValue({
        data: { access_token: 'test_token' }
      });

      axios.get.mockResolvedValue({
        data: {}
      });

      const result = await getZoomRecordings('123456789');

      expect(result).toEqual([]);
    });

    test('should return empty array when API returns 404', async () => {
      axios.post.mockResolvedValue({
        data: { access_token: 'test_token' }
      });

      const error = new Error('Not found');
      error.response = { status: 404 };
      axios.get.mockRejectedValue(error);

      const result = await getZoomRecordings('123456789');

      expect(result).toEqual([]);
    });

    test('should parse and return array of ZoomRecording objects', async () => {
      axios.post.mockResolvedValue({
        data: { access_token: 'test_token' }
      });

      axios.get.mockResolvedValue({
        data: {
          recording_files: [
            {
              id: 'rec_001',
              download_url: 'https://zoom.us/rec/download/abc123',
              play_url: 'https://zoom.us/rec/play/abc123',
              recording_type: 'shared_screen_with_speaker_view',
              recording_start: '2024-01-15T10:00:00Z',
              recording_end: '2024-01-15T11:30:00Z',
              file_size: 1024000,
              status: 'completed'
            },
            {
              id: 'rec_002',
              download_url: 'https://zoom.us/rec/download/def456',
              play_url: 'https://zoom.us/rec/play/def456',
              recording_type: 'gallery_view',
              recording_start: '2024-01-15T10:00:00Z',
              recording_end: '2024-01-15T11:30:00Z',
              file_size: 2048000,
              status: 'processing'
            }
          ]
        }
      });

      const result = await getZoomRecordings('123456789');

      expect(result).toHaveLength(2);
      
      expect(result[0]).toMatchObject({
        recordingId: 'rec_001',
        downloadUrl: 'https://zoom.us/rec/download/abc123',
        playUrl: 'https://zoom.us/rec/play/abc123',
        recordingType: 'cloud',
        fileSizeBytes: 1024000,
        status: 'completed'
      });

      expect(result[1]).toMatchObject({
        recordingId: 'rec_002',
        downloadUrl: 'https://zoom.us/rec/download/def456',
        playUrl: 'https://zoom.us/rec/play/def456',
        recordingType: 'cloud',
        fileSizeBytes: 2048000,
        status: 'processing'
      });
    });

    test('should handle missing optional fields gracefully', async () => {
      axios.post.mockResolvedValue({
        data: { access_token: 'test_token' }
      });

      axios.get.mockResolvedValue({
        data: {
          recording_files: [
            {
              id: 'rec_003',
              recording_type: 'audio_only',
              status: 'completed'
            }
          ]
        }
      });

      const result = await getZoomRecordings('123456789');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        recordingId: 'rec_003',
        downloadUrl: '',
        playUrl: '',
        recordingType: 'cloud',
        durationMs: 0,
        fileSizeBytes: 0,
        status: 'completed'
      });
    });

    test('should calculate duration correctly from start and end times', async () => {
      axios.post.mockResolvedValue({
        data: { access_token: 'test_token' }
      });

      const startTime = '2024-01-15T10:00:00Z';
      const endTime = '2024-01-15T11:30:00Z';
      const expectedDurationMs = new Date(endTime) - new Date(startTime);

      axios.get.mockResolvedValue({
        data: {
          recording_files: [
            {
              id: 'rec_004',
              recording_type: 'speaker_view',
              recording_start: startTime,
              recording_end: endTime,
              status: 'completed'
            }
          ]
        }
      });

      const result = await getZoomRecordings('123456789');

      expect(result[0].durationMs).toBe(expectedDurationMs);
    });

    test('should set recordingType to cloud for known Zoom recording types', async () => {
      axios.post.mockResolvedValue({
        data: { access_token: 'test_token' }
      });

      const recordingTypes = [
        'shared_screen_with_speaker_view',
        'shared_screen_with_gallery_view',
        'speaker_view',
        'gallery_view',
        'audio_only'
      ];

      for (const type of recordingTypes) {
        axios.get.mockResolvedValue({
          data: {
            recording_files: [
              {
                id: 'rec_test',
                recording_type: type,
                status: 'completed'
              }
            ]
          }
        });

        const result = await getZoomRecordings('123456789');
        expect(result[0].recordingType).toBe('cloud');
      }
    });

    test('should throw error for non-404 API errors', async () => {
      axios.post.mockResolvedValue({
        data: { access_token: 'test_token' }
      });

      const error = new Error('Server error');
      error.response = { status: 500, data: { message: 'Internal server error' } };
      axios.get.mockRejectedValue(error);

      await expect(getZoomRecordings('123456789')).rejects.toThrow('Failed to fetch Zoom recordings');
    });
  });
});

// Test encryption and decryption functions
describe('Passcode Encryption and Decryption', () => {
  const { encryptPasscode, decryptPasscode } = require('./zoomUtils');

  describe('encryptPasscode', () => {
    test('should encrypt a passcode successfully', () => {
      const passcode = 'test123';
      const encrypted = encryptPasscode(passcode);
      
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).toContain(':'); // Should have IV:encryptedData format
      expect(encrypted).not.toBe(passcode); // Should not be plain text
    });

    test('should throw error if passcode is missing', () => {
      expect(() => encryptPasscode(null)).toThrow('Passcode is required for encryption');
      expect(() => encryptPasscode('')).toThrow('Passcode is required for encryption');
    });

    // Note: Cannot test missing ZOOM_ENCRYPTION_KEY as it's read at module load time
    test.skip('should throw error if ZOOM_ENCRYPTION_KEY is not set', () => {
      // This test is skipped because ZOOM_ENCRYPTION_KEY is read when the module loads
      // and cannot be changed after that without reloading the module
    });

    test('should generate different encrypted values for same passcode (due to random IV)', () => {
      const passcode = 'test123';
      const encrypted1 = encryptPasscode(passcode);
      const encrypted2 = encryptPasscode(passcode);
      
      expect(encrypted1).not.toBe(encrypted2); // Different IVs should produce different results
    });

    test('should encrypt different passcodes to different values', () => {
      const encrypted1 = encryptPasscode('passcode1');
      const encrypted2 = encryptPasscode('passcode2');
      
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('decryptPasscode', () => {
    test('should decrypt an encrypted passcode successfully', () => {
      const originalPasscode = 'test123';
      const encrypted = encryptPasscode(originalPasscode);
      const decrypted = decryptPasscode(encrypted);
      
      expect(decrypted).toBe(originalPasscode);
    });

    test('should throw error if encrypted passcode is missing', () => {
      expect(() => decryptPasscode(null)).toThrow('Encrypted passcode is required for decryption');
      expect(() => decryptPasscode('')).toThrow('Encrypted passcode is required for decryption');
    });

    // Note: Cannot test missing ZOOM_ENCRYPTION_KEY as it's read at module load time
    test.skip('should throw error if ZOOM_ENCRYPTION_KEY is not set', () => {
      // This test is skipped because ZOOM_ENCRYPTION_KEY is read when the module loads
      // and cannot be changed after that without reloading the module
    });

    test('should throw error for invalid encrypted passcode format', () => {
      expect(() => decryptPasscode('invalid_format')).toThrow('Failed to decrypt passcode');
    });

    test('should handle various passcode lengths', () => {
      const passcodes = ['a', 'abc', 'test123', 'very_long_passcode_with_special_chars_!@#$%'];
      
      passcodes.forEach(passcode => {
        const encrypted = encryptPasscode(passcode);
        const decrypted = decryptPasscode(encrypted);
        expect(decrypted).toBe(passcode);
      });
    });

    test('should handle passcodes with special characters', () => {
      const passcode = 'P@ssw0rd!#$%^&*()';
      const encrypted = encryptPasscode(passcode);
      const decrypted = decryptPasscode(encrypted);
      
      expect(decrypted).toBe(passcode);
    });

    test('should handle passcodes with unicode characters', () => {
      const passcode = 'パスワード123';
      const encrypted = encryptPasscode(passcode);
      const decrypted = decryptPasscode(encrypted);
      
      expect(decrypted).toBe(passcode);
    });
  });

  describe('Encryption/Decryption Integration', () => {
    test('should maintain data integrity through encrypt-decrypt cycle', () => {
      const testPasscodes = [
        '123456',
        'abc123',
        'Test@123',
        'very-long-passcode-with-dashes-and-numbers-12345',
        '!@#$%^&*()',
        'パスワード'
      ];

      testPasscodes.forEach(passcode => {
        const encrypted = encryptPasscode(passcode);
        const decrypted = decryptPasscode(encrypted);
        expect(decrypted).toBe(passcode);
      });
    });

    test('should produce encrypted values in correct format (iv:encryptedData)', () => {
      const passcode = 'test123';
      const encrypted = encryptPasscode(passcode);
      
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(2);
      
      // IV should be 32 hex characters (16 bytes)
      expect(parts[0]).toHaveLength(32);
      expect(/^[0-9a-f]+$/.test(parts[0])).toBe(true);
      
      // Encrypted data should be hex
      expect(/^[0-9a-f]+$/.test(parts[1])).toBe(true);
    });
  });
});
