/**
 * Mock Zoom Utilities for Development/Testing
 * 
 * This module provides mock implementations of Zoom API functions
 * for development and testing without real Zoom credentials.
 * 
 * Enable by setting ZOOM_MOCK_MODE=true in .env
 */

const crypto = require('crypto');

/**
 * Generate a mock meeting ID
 */
const generateMockMeetingId = () => {
  return Math.floor(Math.random() * 9000000000) + 1000000000; // 10-digit number
};

/**
 * Generate a mock passcode
 */
const generateMockPasscode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

/**
 * Mock: Create a Zoom meeting
 */
const createZoomMeeting = async (topic, startTime, duration, hostEmail) => {
  console.log('[Mock Zoom] Creating mock meeting:', { topic, startTime, duration, hostEmail });
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const meetingId = generateMockMeetingId();
  const passcode = generateMockPasscode();
  
  return {
    meetingId: meetingId.toString(),
    meetingNumber: meetingId,
    passcode: passcode, // In mock mode, we don't encrypt
    joinUrl: `https://zoom.us/j/${meetingId}?pwd=${passcode}`,
    startUrl: `https://zoom.us/s/${meetingId}?zak=mock_zak_token`,
    hostEmail: hostEmail,
    createdAt: new Date()
  };
};

/**
 * Mock: Generate Zoom SDK signature
 */
const generateZoomSignature = async (meetingNumber, role, sessionId = null, userId = null) => {
  console.log('[Mock Zoom] Generating mock signature:', { meetingNumber, role, sessionId, userId });
  
  // Generate a fake JWT-like signature
  const mockPayload = {
    sdkKey: 'MOCK_SDK_KEY',
    mn: meetingNumber.toString(),
    role: role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (2 * 60 * 60)
  };
  
  // Create a mock signature (not a real JWT, just for testing)
  const mockSignature = Buffer.from(JSON.stringify(mockPayload)).toString('base64');
  
  return mockSignature;
};

/**
 * Mock: Get Zoom recordings
 * Enhanced to generate realistic recording metadata
 */
const getZoomRecordings = async (meetingId, sessionId = null) => {
  console.log('[Mock Zoom] Fetching mock recordings:', { meetingId, sessionId });
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Generate realistic mock recording data
  // Simulate that recordings are available after session ends
  const mockRecording = {
    recordingId: `mock_rec_${meetingId}_${Date.now()}`,
    downloadUrl: `https://mock-zoom.example.com/rec/${meetingId}/download`,
    playUrl: `https://mock-zoom.example.com/rec/${meetingId}/play.mp4`,
    recordingType: 'cloud',
    durationMs: Math.floor(Math.random() * 3600000) + 1800000, // 30-90 minutes
    fileSizeBytes: Math.floor(Math.random() * 400000000) + 100000000, // 100-500 MB
    status: 'completed',
    createdAt: new Date()
  };
  
  return [mockRecording];
};

/**
 * Mock: Sync Zoom recordings
 * Enhanced with realistic recording metadata
 */
const syncZoomRecordings = async (sessionId, retryAttempt = 0) => {
  const LiveSession = require('../models/liveSessionModel');
  
  console.log('[Mock Zoom] Syncing mock recordings for session:', sessionId);
  
  const session = await LiveSession.findById(sessionId);
  
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  if (session.status !== 'ended') {
    throw new Error(`Session must be ended to sync recordings. Current status: ${session.status}`);
  }
  
  // Generate realistic mock recording data immediately
  console.log('[Mock Zoom] Generating realistic mock recording data');
  
  // Calculate realistic duration based on session duration
  const durationMs = session.duration * 60 * 1000; // Convert minutes to ms
  
  // Generate realistic file size (approximately 1 MB per minute of video)
  const fileSizeBytes = Math.floor(durationMs / 1000 / 60 * 1024 * 1024 * 1.2); // ~1.2 MB per minute
  
  session.recording = {
    recordingId: `mock_rec_${session._id}_${Date.now()}`,
    downloadUrl: `https://mock-zoom.example.com/rec/${session._id}/download`,
    playUrl: `https://mock-zoom.example.com/rec/${session._id}/play.mp4`,
    recordingType: 'cloud',
    durationMs: durationMs,
    fileSizeBytes: fileSizeBytes,
    status: 'completed',
    createdAt: new Date()
  };
  
  await session.save();
  console.log('[Mock Zoom] Mock recording data saved:', {
    recordingId: session.recording.recordingId,
    durationMs: session.recording.durationMs,
    fileSizeBytes: session.recording.fileSizeBytes
  });
  
  return session;
};

/**
 * Mock: Decrypt passcode (in mock mode, passcodes are not encrypted)
 */
const decryptPasscode = (passcode) => {
  return passcode; // No encryption in mock mode
};

/**
 * Mock: Delete Zoom meeting
 */
const deleteZoomMeeting = async (meetingId) => {
  console.log('[Mock Zoom] Deleting mock meeting:', meetingId);
  await new Promise(resolve => setTimeout(resolve, 200));
  return { success: true };
};

/**
 * Mock Webhook Simulator
 * Simulates a Zoom recording.completed webhook for testing
 * 
 * @param {string} sessionId - LiveSession ID
 * @returns {Object} Mock webhook payload
 */
const simulateMockWebhook = async (sessionId) => {
  const LiveSession = require('../models/liveSessionModel');
  
  console.log('[Mock Zoom] Simulating webhook for session:', sessionId);
  
  const session = await LiveSession.findById(sessionId);
  
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  if (!session.zoom || !session.zoom.meetingId) {
    throw new Error('Session does not have Zoom meeting data');
  }
  
  // Generate realistic mock webhook payload
  const mockWebhookPayload = {
    event: 'recording.completed',
    payload: {
      account_id: 'mock_account_id',
      object: {
        uuid: session.zoom.meetingId,
        id: session.zoom.meetingNumber || parseInt(session.zoom.meetingId),
        host_id: 'mock_host_id',
        topic: session.topic,
        type: 2,
        start_time: session.startTime.toISOString(),
        duration: session.duration,
        recording_files: [
          {
            id: `mock_file_${Date.now()}`,
            meeting_id: session.zoom.meetingId,
            recording_start: session.startTime.toISOString(),
            recording_end: session.endTime ? session.endTime.toISOString() : new Date(session.startTime.getTime() + session.duration * 60000).toISOString(),
            file_type: 'MP4',
            file_size: Math.floor(session.duration * 60 * 1024 * 1024 * 1.2), // ~1.2 MB per minute
            play_url: `https://mock-zoom.example.com/rec/${session._id}/play.mp4`,
            download_url: `https://mock-zoom.example.com/rec/${session._id}/download`,
            status: 'completed',
            recording_type: 'shared_screen_with_speaker_view'
          }
        ]
      }
    }
  };
  
  console.log('[Mock Zoom] Generated mock webhook payload:', {
    event: mockWebhookPayload.event,
    meetingId: mockWebhookPayload.payload.object.uuid,
    filesCount: mockWebhookPayload.payload.object.recording_files.length
  });
  
  return mockWebhookPayload;
};

module.exports = {
  createZoomMeeting,
  generateZoomSignature,
  getZoomRecordings,
  syncZoomRecordings,
  decryptPasscode,
  deleteZoomMeeting,
  simulateMockWebhook
};
