const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const redisCache = require('./redisCache');

/**
 * Zoom API Configuration
 */
const ZOOM_API_BASE_URL = 'https://api.zoom.us/v2';
const ZOOM_API_KEY = process.env.ZOOM_API_KEY;
const ZOOM_API_SECRET = process.env.ZOOM_API_SECRET;
const ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
const ZOOM_SDK_KEY = process.env.ZOOM_SDK_KEY;
const ZOOM_SDK_SECRET = process.env.ZOOM_SDK_SECRET;
const ZOOM_ENCRYPTION_KEY = process.env.ZOOM_ENCRYPTION_KEY;

/**
 * Mock Mode Configuration
 * Enable mock mode for development/testing without real Zoom credentials
 */
const ZOOM_MOCK_MODE = process.env.ZOOM_MOCK_MODE === 'true';

// If mock mode is enabled, use mock implementations
if (ZOOM_MOCK_MODE) {
  console.log('[Zoom] ⚠️  MOCK MODE ENABLED - Using mock Zoom implementations for development');
  const mockZoomUtils = require('./mockZoomUtils');
  module.exports = mockZoomUtils;
  return;
}

/**
 * Encryption Configuration
 */
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

/**
 * Rate limit queue for Zoom API requests
 */
const rateLimitQueue = [];
let isProcessingQueue = false;
let rateLimitResetTime = null;

/**
 * Process queued requests after rate limit window expires
 */
const processRateLimitQueue = async () => {
  if (isProcessingQueue || rateLimitQueue.length === 0) {
    return;
  }

  // Check if we're still in rate limit window
  if (rateLimitResetTime && Date.now() < rateLimitResetTime) {
    const waitMs = rateLimitResetTime - Date.now();
    console.log(`[Zoom Rate Limit] Still in rate limit window. Waiting ${Math.ceil(waitMs / 1000)}s before processing queue`);
    setTimeout(processRateLimitQueue, waitMs);
    return;
  }

  isProcessingQueue = true;
  console.log(`[Zoom Rate Limit] Processing ${rateLimitQueue.length} queued Zoom API requests`);

  while (rateLimitQueue.length > 0) {
    const { resolve, reject, fn, sessionId, operation } = rateLimitQueue.shift();
    try {
      console.log(`[Zoom Rate Limit] Processing queued request - Session: ${sessionId || 'N/A'}, Operation: ${operation}`);
      const result = await fn();
      resolve(result);
    } catch (error) {
      console.error(`[Zoom Rate Limit] Queued request failed - Session: ${sessionId || 'N/A'}, Operation: ${operation}, Error: ${error.message}`);
      reject(error);
    }
    // Add small delay between requests to avoid hitting rate limits again
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  isProcessingQueue = false;
  rateLimitResetTime = null;
  console.log(`[Zoom Rate Limit] Queue processing complete`);
};

/**
 * Queue a request to be executed after rate limit window expires
 * @param {Function} fn - Function to execute
 * @param {string} sessionId - Session ID for logging
 * @param {string} operation - Operation type for logging
 * @returns {Promise} Promise that resolves when the queued function executes
 */
const queueRateLimitedRequest = (fn, sessionId, operation) => {
  return new Promise((resolve, reject) => {
    console.log(`[Zoom Rate Limit] Queueing request - Session: ${sessionId || 'N/A'}, Operation: ${operation}`);
    rateLimitQueue.push({ resolve, reject, fn, sessionId, operation });
    
    // Start processing queue if not already processing
    if (!isProcessingQueue && rateLimitResetTime && Date.now() >= rateLimitResetTime) {
      processRateLimitQueue();
    }
  });
};

/**
 * Generate Zoom API access token using Server-to-Server OAuth
 * @param {string} sessionId - Session ID for logging (optional)
 * @param {string} operation - Operation type for logging (optional)
 * @returns {Promise<string>} Access token
 */
const getZoomAccessToken = async (sessionId = null, operation = 'unknown') => {
  try {
    // Check if credentials are configured
    if (!ZOOM_API_KEY || !ZOOM_API_SECRET || !ZOOM_ACCOUNT_ID) {
      const errorMsg = 'Zoom API credentials are missing or invalid';
      console.error(`[Zoom Error] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Error: ${errorMsg}`);
      // Return 500 without exposing credential details
      const error = new Error('Zoom API configuration error');
      error.statusCode = 500;
      error.isCredentialError = true;
      throw error;
    }

    const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`;
    
    const response = await axios.post(tokenUrl, {}, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${ZOOM_API_KEY}:${ZOOM_API_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    return response.data.access_token;
  } catch (error) {
    // If already a credential error, re-throw
    if (error.isCredentialError) {
      throw error;
    }

    // Handle credential errors (401, 403)
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.error(`[Zoom Error] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Error: Credential authentication failed (${error.response.status}), Details: ${JSON.stringify(error.response?.data || {})}`);
      // Return 500 without exposing credential details
      const credError = new Error('Zoom API configuration error');
      credError.statusCode = 500;
      credError.isCredentialError = true;
      throw credError;
    }

    // Handle rate limit errors (429)
    if (error.response?.status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
      console.error(`[Zoom Error] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Error: Rate limit exceeded, retry after ${retryAfter}s`);
      
      // Set rate limit reset time
      rateLimitResetTime = Date.now() + (retryAfter * 1000);
      
      // Schedule queue processing after rate limit window
      setTimeout(processRateLimitQueue, retryAfter * 1000);
      
      const rateLimitError = new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
      rateLimitError.statusCode = 429;
      rateLimitError.isRateLimitError = true;
      rateLimitError.retryAfter = retryAfter;
      throw rateLimitError;
    }

    // Log all other errors with details
    console.error(`[Zoom Error] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Error: ${error.response?.data?.message || error.message}, Status: ${error.response?.status || 'N/A'}, Details: ${JSON.stringify(error.response?.data || {})}`);
    const genericError = new Error('Failed to generate Zoom access token');
    genericError.statusCode = error.response?.status || 500;
    throw genericError;
  }
};

/**
 * Encrypt a passcode using AES-256-CBC
 * @param {string} passcode - Plain text passcode
 * @returns {string} Encrypted passcode in format: iv:encryptedData
 */
const encryptPasscode = (passcode) => {
  if (!passcode) {
    throw new Error('Passcode is required for encryption');
  }
  
  if (!ZOOM_ENCRYPTION_KEY) {
    throw new Error('ZOOM_ENCRYPTION_KEY environment variable is not set');
  }

  // Ensure the encryption key is 32 bytes for AES-256
  const key = crypto.createHash('sha256').update(ZOOM_ENCRYPTION_KEY).digest();
  
  // Generate a random initialization vector
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  // Encrypt the passcode
  let encrypted = cipher.update(passcode, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV and encrypted data separated by colon
  return `${iv.toString('hex')}:${encrypted}`;
};

/**
 * Decrypt a passcode using AES-256-CBC
 * @param {string} encryptedPasscode - Encrypted passcode in format: iv:encryptedData
 * @returns {string} Decrypted plain text passcode
 */
const decryptPasscode = (encryptedPasscode) => {
  if (!encryptedPasscode) {
    throw new Error('Encrypted passcode is required for decryption');
  }
  
  if (!ZOOM_ENCRYPTION_KEY) {
    throw new Error('ZOOM_ENCRYPTION_KEY environment variable is not set');
  }

  try {
    // Split the IV and encrypted data
    const parts = encryptedPasscode.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted passcode format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = parts[1];
    
    // Ensure the encryption key is 32 bytes for AES-256
    const key = crypto.createHash('sha256').update(ZOOM_ENCRYPTION_KEY).digest();
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    
    // Decrypt the passcode
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting passcode:', error.message);
    throw new Error('Failed to decrypt passcode');
  }
};

/**
 * Create a Zoom meeting via Zoom API
 * @param {string} topic - Meeting topic/title
 * @param {Date} startTime - Meeting start time
 * @param {number} duration - Meeting duration in minutes
 * @param {string} hostEmail - Host email address
 * @returns {Promise<Object>} ZoomMeetingData object
 */
const createZoomMeeting = async (topic, startTime, duration, hostEmail) => {
  const sessionId = 'pending'; // Session not created yet
  const operation = 'create_meeting';

  // Validate inputs
  if (!topic || topic.trim() === '') {
    console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Error: Topic validation failed - empty topic`);
    throw new Error('Topic must be a non-empty string');
  }
  if (!(startTime instanceof Date) || startTime <= new Date()) {
    console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Error: Start time validation failed - invalid or past date`);
    throw new Error('Start time must be a valid future date');
  }
  if (!duration || duration <= 0) {
    console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Error: Duration validation failed - non-positive value: ${duration}`);
    throw new Error('Duration must be a positive integer');
  }
  if (!hostEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hostEmail)) {
    console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Error: Host email validation failed - invalid format`);
    throw new Error('Host email must be a valid email format');
  }

  // Retry logic with exponential backoff
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Zoom] Session: ${sessionId}, Operation: ${operation}, Attempt: ${attempt}/${maxRetries}`);

      // Get OAuth access token
      const accessToken = await getZoomAccessToken(sessionId, operation);

      // Prepare meeting payload
      const meetingPayload = {
        topic: topic,
        type: 2, // Scheduled meeting
        start_time: startTime.toISOString(),
        duration: duration,
        timezone: 'UTC',
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          mute_upon_entry: true,
          waiting_room: false,
          audio: 'both',
          auto_recording: 'cloud',
          approval_type: 0, // Automatically approve
          registration_type: 1,
          enforce_login: false
        }
      };

      // Call Zoom API to create meeting
      const response = await axios.post(
        `${ZOOM_API_BASE_URL}/users/me/meetings`,
        meetingPayload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const meetingData = response.data;

      // Validate response has all required fields
      if (!meetingData.id || !meetingData.password || !meetingData.join_url || !meetingData.start_url) {
        console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Error: Zoom API response missing required fields, Response: ${JSON.stringify(meetingData)}`);
        throw new Error('Zoom API response missing required fields');
      }

      // Encrypt the passcode before storing
      const encryptedPasscode = encryptPasscode(meetingData.password);

      console.log(`[Zoom] Session: ${sessionId}, Operation: ${operation}, Success: Meeting created with ID ${meetingData.id}`);

      // Return structured ZoomMeetingData object with encrypted passcode
      return {
        meetingId: meetingData.id.toString(),
        meetingNumber: meetingData.id,
        passcode: encryptedPasscode,
        joinUrl: meetingData.join_url,
        startUrl: meetingData.start_url,
        hostEmail: hostEmail,
        createdAt: new Date()
      };

    } catch (error) {
      lastError = error;
      
      // Log error with full details
      console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Attempt: ${attempt}/${maxRetries}, Error: ${error.message}, Status: ${error.statusCode || error.response?.status || 'N/A'}`);

      // Handle rate limit errors - queue the request
      if (error.isRateLimitError) {
        console.log(`[Zoom Rate Limit] Session: ${sessionId}, Operation: ${operation}, Queueing request for retry after ${error.retryAfter}s`);
        
        // Queue this request to be retried after rate limit window
        return queueRateLimitedRequest(
          () => createZoomMeeting(topic, startTime, duration, hostEmail),
          sessionId,
          operation
        );
      }

      // Handle credential errors - don't retry, fail immediately
      if (error.isCredentialError) {
        console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Fatal: Credential error, not retrying`);
        throw error;
      }

      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff: wait 2^attempt seconds
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.log(`[Zoom] Session: ${sessionId}, Operation: ${operation}, Retrying in ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  // All retries failed
  console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Fatal: All ${maxRetries} attempts failed, Last error: ${lastError.message}`);
  const finalError = new Error(`Failed to create Zoom meeting after ${maxRetries} attempts: ${lastError.message}`);
  finalError.statusCode = lastError.statusCode || 503;
  throw finalError;
};

/**
 * Generate JWT signature for Zoom SDK authentication
 * @param {string} meetingNumber - Zoom meeting number
 * @param {number} role - User role (0 = participant, 1 = host)
 * @param {string} sessionId - Session ID (optional, for caching)
 * @param {string} userId - User ID (optional, for caching)
 * @returns {Promise<string>} JWT signature
 */
const generateZoomSignature = async (meetingNumber, role, sessionId = null, userId = null) => {
  // Validate inputs
  if (!meetingNumber) {
    throw new Error('Meeting number is required');
  }
  if (role !== 0 && role !== 1) {
    throw new Error('Role must be 0 (participant) or 1 (host)');
  }
  if (!ZOOM_SDK_KEY || !ZOOM_SDK_SECRET) {
    console.error('Zoom SDK credentials are missing');
    throw new Error('Zoom SDK configuration error');
  }

  // Check Redis cache if sessionId and userId are provided
  if (sessionId && userId) {
    const cacheKey = `zoom:sig:${sessionId}:${userId}:${role}`;
    try {
      const r = redisCache.getRedis();
      if (r) {
        const cachedSignature = await r.get(cacheKey);
        if (cachedSignature) {
          console.log(`Using cached Zoom signature for session ${sessionId}, user ${userId}, role ${role}`);
          return cachedSignature;
        }
      }
    } catch (error) {
      console.warn('Redis cache read error (non-fatal):', error.message);
    }
  }

  // Generate JWT signature
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (2 * 60 * 60); // 2 hours from now

  const payload = {
    sdkKey: ZOOM_SDK_KEY,
    mn: meetingNumber.toString(),
    role: role,
    iat: iat,
    exp: exp,
    tokenExp: exp
  };

  try {
    const signature = jwt.sign(payload, ZOOM_SDK_SECRET);

    // Cache signature for 1 hour if sessionId and userId are provided
    if (sessionId && userId) {
      const cacheKey = `zoom:sig:${sessionId}:${userId}:${role}`;
      const cacheTTL = 60 * 60; // 1 hour in seconds
      try {
        const r = redisCache.getRedis();
        if (r) {
          await r.setEx(cacheKey, cacheTTL, signature);
          console.log(`Cached Zoom signature for session ${sessionId}, user ${userId}, role ${role}`);
        }
      } catch (error) {
        console.warn('Redis cache write error (non-fatal):', error.message);
      }
    }

    return signature;
  } catch (error) {
    console.error('Error generating JWT signature:', error.message);
    throw new Error('Failed to generate Zoom signature');
  }
};

/**
 * Generate Zoom SDK configuration for a user to join a meeting
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {number} role - User role (0 = participant, 1 = host)
 * @param {Object} session - Session object with Zoom data
 * @param {Object} user - User object
 * @returns {Promise<Object>} SDK configuration object
 */
const generateSDKConfig = async (sessionId, userId, role, session, user) => {
  // TODO: Implement in Task 7 - SDK configuration endpoint
  // This will:
  // 1. Check Redis cache for existing signature
  // 2. Generate new signature if not cached
  // 3. Cache signature for 1 hour
  // 4. Return complete SDK config object
  throw new Error('generateSDKConfig not yet implemented');
};

/**
 * Fetch cloud recordings for a Zoom meeting
 * @param {string} meetingId - Zoom meeting ID
 * @param {string} sessionId - Session ID for logging (optional)
 * @returns {Promise<Array>} Array of ZoomRecording objects
 */
const getZoomRecordings = async (meetingId, sessionId = null) => {
  const operation = 'get_recordings';

  if (!meetingId) {
    console.error(`[Zoom Error] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Error: Meeting ID is required`);
    throw new Error('Meeting ID is required');
  }

  try {
    console.log(`[Zoom] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Meeting: ${meetingId}`);

    // Get OAuth access token
    const accessToken = await getZoomAccessToken(sessionId, operation);

    // Call Zoom API to fetch cloud recordings
    const response = await axios.get(
      `${ZOOM_API_BASE_URL}/meetings/${meetingId}/recordings`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const recordingsData = response.data;

    // Handle case where no recordings exist
    if (!recordingsData.recording_files || recordingsData.recording_files.length === 0) {
      console.log(`[Zoom] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Meeting: ${meetingId}, Result: No recordings found`);
      return [];
    }

    // Parse and structure recording data
    const recordings = recordingsData.recording_files.map(file => ({
      recordingId: file.id,
      downloadUrl: file.download_url || '',
      playUrl: file.play_url || '',
      recordingType: file.recording_type === 'shared_screen_with_speaker_view' || 
                     file.recording_type === 'shared_screen_with_gallery_view' ||
                     file.recording_type === 'speaker_view' ||
                     file.recording_type === 'gallery_view' ||
                     file.recording_type === 'audio_only' ? 'cloud' : 'local',
      durationMs: (file.recording_end && file.recording_start) 
        ? new Date(file.recording_end) - new Date(file.recording_start)
        : 0,
      fileSizeBytes: file.file_size || 0,
      status: file.status === 'completed' ? 'completed' : 'processing',
      createdAt: file.recording_start ? new Date(file.recording_start) : new Date()
    }));

    console.log(`[Zoom] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Meeting: ${meetingId}, Result: Found ${recordings.length} recording(s)`);
    return recordings;

  } catch (error) {
    // Handle rate limit errors - queue the request
    if (error.isRateLimitError) {
      console.log(`[Zoom Rate Limit] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Queueing request for retry after ${error.retryAfter}s`);
      
      return queueRateLimitedRequest(
        () => getZoomRecordings(meetingId, sessionId),
        sessionId,
        operation
      );
    }

    // Handle credential errors
    if (error.isCredentialError) {
      console.error(`[Zoom Error] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Meeting: ${meetingId}, Fatal: Credential error`);
      throw error;
    }

    // Handle 404 - no recordings found
    if (error.response?.status === 404) {
      console.log(`[Zoom] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Meeting: ${meetingId}, Result: No recordings found (404)`);
      return [];
    }

    // Log and re-throw other errors
    console.error(`[Zoom Error] Session: ${sessionId || 'N/A'}, Operation: ${operation}, Meeting: ${meetingId}, Error: ${error.response?.data?.message || error.message}, Status: ${error.response?.status || 'N/A'}, Details: ${JSON.stringify(error.response?.data || {})}`);
    const recordingError = new Error(`Failed to fetch Zoom recordings: ${error.message}`);
    recordingError.statusCode = error.statusCode || error.response?.status || 500;
    throw recordingError;
  }
};

/**
 * Sync Zoom recordings for a session
 * @param {string} sessionId - Session ID
 * @param {number} retryAttempt - Current retry attempt (internal use)
 * @returns {Promise<Object>} Updated session with recording data
 */
const syncZoomRecordings = async (sessionId, retryAttempt = 0) => {
  const LiveSession = require('../models/liveSessionModel');
  const operation = 'sync_recordings';
  
  if (!sessionId) {
    console.error(`[Zoom Error] Session: N/A, Operation: ${operation}, Error: Session ID is required`);
    throw new Error('Session ID is required');
  }

  try {
    console.log(`[Zoom] Session: ${sessionId}, Operation: ${operation}, Attempt: ${retryAttempt + 1}`);

    // Step 1: Fetch session from database
    const session = await LiveSession.findById(sessionId);
    
    if (!session) {
      console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Error: Session not found`);
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Verify session has ended
    if (session.status !== 'ended') {
      console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Error: Session must be ended, Current status: ${session.status}`);
      throw new Error(`Session must be ended to sync recordings. Current status: ${session.status}`);
    }

    // Verify Zoom meeting data exists
    if (!session.zoom || !session.zoom.meetingId) {
      console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Error: Session does not have Zoom meeting data`);
      throw new Error('Session does not have Zoom meeting data');
    }

    console.log(`[Zoom] Session: ${sessionId}, Operation: ${operation}, Meeting: ${session.zoom.meetingId}, Attempt: ${retryAttempt + 1}`);

    // Step 2: Call getZoomRecordings with meeting ID
    const recordings = await getZoomRecordings(session.zoom.meetingId, sessionId);

    // Step 3: Handle different scenarios
    if (recordings.length === 0) {
      // No recordings found - implement retry logic
      console.log(`[Zoom] Session: ${sessionId}, Operation: ${operation}, Result: No recordings found`);
      
      // Check if we should retry (24 hours = 288 attempts at 5-minute intervals)
      const maxRetries = 288;
      const retryIntervalMs = 5 * 60 * 1000; // 5 minutes
      
      if (retryAttempt < maxRetries) {
        // Update recording status to 'failed' temporarily
        session.recording = {
          status: 'failed',
          createdAt: new Date()
        };
        await session.save();
        
        console.log(`[Zoom] Session: ${sessionId}, Operation: ${operation}, Scheduling retry ${retryAttempt + 1}/${maxRetries} in 5 minutes`);
        
        // Schedule retry using setTimeout
        setTimeout(async () => {
          try {
            await syncZoomRecordings(sessionId, retryAttempt + 1);
          } catch (error) {
            console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Retry ${retryAttempt + 1} failed: ${error.message}`);
          }
        }, retryIntervalMs);
        
        return session;
      } else {
        // Give up after 24 hours
        console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Fatal: No recordings found after 24 hours (${maxRetries} attempts). Marking as permanently unavailable.`);
        session.recording = {
          status: 'failed',
          createdAt: new Date()
        };
        await session.save();
        return session;
      }
    }

    // Step 4: Process recordings
    const primaryRecording = recordings[0]; // Use first recording as primary
    
    // Check if recording is still processing
    if (primaryRecording.status === 'processing') {
      console.log(`[Zoom] Session: ${sessionId}, Operation: ${operation}, Result: Recording still processing`);
      
      // Implement retry logic for processing status
      const maxRetries = 288; // 24 hours at 5-minute intervals
      const retryIntervalMs = 5 * 60 * 1000; // 5 minutes
      
      if (retryAttempt < maxRetries) {
        // Update recording status to 'processing'
        session.recording = {
          recordingId: primaryRecording.recordingId,
          downloadUrl: primaryRecording.downloadUrl,
          playUrl: primaryRecording.playUrl,
          recordingType: primaryRecording.recordingType,
          durationMs: primaryRecording.durationMs,
          fileSizeBytes: primaryRecording.fileSizeBytes,
          status: 'processing',
          createdAt: primaryRecording.createdAt
        };
        await session.save();
        
        console.log(`[Zoom] Session: ${sessionId}, Operation: ${operation}, Scheduling retry ${retryAttempt + 1}/${maxRetries} in 5 minutes for processing recording`);
        
        // Schedule retry using setTimeout
        setTimeout(async () => {
          try {
            await syncZoomRecordings(sessionId, retryAttempt + 1);
          } catch (error) {
            console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Retry ${retryAttempt + 1} failed: ${error.message}`);
          }
        }, retryIntervalMs);
        
        return session;
      } else {
        // Give up after 24 hours
        console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Fatal: Recording still processing after 24 hours (${maxRetries} attempts). Marking as failed.`);
        session.recording = {
          recordingId: primaryRecording.recordingId,
          downloadUrl: primaryRecording.downloadUrl,
          playUrl: primaryRecording.playUrl,
          recordingType: primaryRecording.recordingType,
          durationMs: primaryRecording.durationMs,
          fileSizeBytes: primaryRecording.fileSizeBytes,
          status: 'failed',
          createdAt: primaryRecording.createdAt
        };
        await session.save();
        return session;
      }
    }

    // Step 5: Recording is completed - update session
    console.log(`[Zoom] Session: ${sessionId}, Operation: ${operation}, Success: Recording completed`);
    session.recording = {
      recordingId: primaryRecording.recordingId,
      downloadUrl: primaryRecording.downloadUrl,
      playUrl: primaryRecording.playUrl,
      recordingType: primaryRecording.recordingType,
      durationMs: primaryRecording.durationMs,
      fileSizeBytes: primaryRecording.fileSizeBytes,
      status: 'completed',
      createdAt: primaryRecording.createdAt
    };
    
    await session.save();
    console.log(`[Zoom] Session: ${sessionId}, Operation: ${operation}, Success: Successfully synced recording`);
    
    return session;

  } catch (error) {
    // Handle rate limit errors - queue the request
    if (error.isRateLimitError) {
      console.log(`[Zoom Rate Limit] Session: ${sessionId}, Operation: ${operation}, Queueing request for retry after ${error.retryAfter}s`);
      
      return queueRateLimitedRequest(
        () => syncZoomRecordings(sessionId, retryAttempt),
        sessionId,
        operation
      );
    }

    // Handle credential errors
    if (error.isCredentialError) {
      console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Fatal: Credential error`);
      throw error;
    }

    // Log all other errors
    console.error(`[Zoom Error] Session: ${sessionId}, Operation: ${operation}, Error: ${error.message}, Status: ${error.statusCode || 'N/A'}`);
    throw error;
  }
};

/**
 * Delete a Zoom meeting
 * @param {string} meetingId - Zoom meeting ID
 * @returns {Promise<void>}
 */
const deleteZoomMeeting = async (meetingId) => {
  // TODO: Optional - Implement if needed for session cancellation
  throw new Error('deleteZoomMeeting not yet implemented');
};

module.exports = {
  createZoomMeeting,
  generateZoomSignature,
  generateSDKConfig,
  getZoomRecordings,
  syncZoomRecordings,
  deleteZoomMeeting,
  getZoomAccessToken,
  encryptPasscode,
  decryptPasscode,
  queueRateLimitedRequest,
  processRateLimitQueue
};
