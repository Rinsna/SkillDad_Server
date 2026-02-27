/**
 * Performance Test: LiveSession Recording Index
 * 
 * Tests the compound index { status: 1, 'recording.status': 1, endTime: -1 }
 * for the available recordings query.
 * 
 * Requirements: 2.7, 11.1, 11.6
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const LiveSession = require('../models/liveSessionModel');
const User = require('../models/userModel');

describe('LiveSession Recording Index Performance', () => {
    let universityUser;
    let testSessions = [];

    beforeAll(async () => {
        // Connect to database
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGO_URI);
        }

        // Clean up existing test data
        await User.deleteMany({ email: 'recording-index-test@test.com' });
        await LiveSession.deleteMany({ topic: /^Recording Index Test/ });

        // Create test university user
        universityUser = await User.create({
            name: 'Recording Index Test University',
            email: 'recording-index-test@test.com',
            password: 'password123',
            role: 'university',
            profile: {
                universityName: 'Recording Index Test University'
            }
        });

        // Create test sessions with various states
        const now = new Date();
        const sessionsToCreate = [];

        // Create 50 sessions with completed recordings (should be returned)
        for (let i = 0; i < 50; i++) {
            sessionsToCreate.push({
                topic: `Recording Index Test - Completed ${i}`,
                description: 'Test session with completed recording',
                university: universityUser._id,
                instructor: universityUser._id,
                startTime: new Date(now.getTime() - (i + 1) * 3600000), // 1 hour apart
                endTime: new Date(now.getTime() - i * 3600000),
                duration: 60,
                status: 'ended',
                recording: {
                    recordingId: `test-recording-${i}`,
                    playUrl: `https://zoom.us/rec/play/test-${i}`,
                    downloadUrl: `https://zoom.us/rec/download/test-${i}`,
                    recordingType: 'cloud',
                    durationMs: 3600000,
                    fileSizeBytes: 100000000,
                    status: 'completed',
                    createdAt: new Date(now.getTime() - i * 3600000)
                }
            });
        }

        // Create 20 sessions with pending recordings (should NOT be returned)
        for (let i = 0; i < 20; i++) {
            sessionsToCreate.push({
                topic: `Recording Index Test - Pending ${i}`,
                description: 'Test session with pending recording',
                university: universityUser._id,
                instructor: universityUser._id,
                startTime: new Date(now.getTime() - (i + 51) * 3600000),
                endTime: new Date(now.getTime() - (i + 50) * 3600000),
                duration: 60,
                status: 'ended',
                recording: {
                    status: 'pending'
                }
            });
        }

        // Create 20 scheduled sessions (should NOT be returned)
        for (let i = 0; i < 20; i++) {
            sessionsToCreate.push({
                topic: `Recording Index Test - Scheduled ${i}`,
                description: 'Test scheduled session',
                university: universityUser._id,
                instructor: universityUser._id,
                startTime: new Date(now.getTime() + (i + 1) * 3600000),
                duration: 60,
                status: 'scheduled'
            });
        }

        // Create 10 live sessions (should NOT be returned)
        for (let i = 0; i < 10; i++) {
            sessionsToCreate.push({
                topic: `Recording Index Test - Live ${i}`,
                description: 'Test live session',
                university: universityUser._id,
                instructor: universityUser._id,
                startTime: new Date(now.getTime() - 1800000), // 30 minutes ago
                duration: 60,
                status: 'live'
            });
        }

        testSessions = await LiveSession.insertMany(sessionsToCreate);
    }, 30000); // 30 second timeout for setup

    afterAll(async () => {
        // Clean up test data
        await LiveSession.deleteMany({ topic: /^Recording Index Test/ });
        await User.deleteMany({ email: 'recording-index-test@test.com' });
        
        // Close database connection
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
    }, 10000); // 10 second timeout for cleanup

    describe('Index Existence', () => {
        it('should have the compound index on status, recording.status, and endTime', async () => {
            const collection = mongoose.connection.collection('livesessions');
            const indexes = await collection.indexes();
            
            const recordingIndex = indexes.find(idx => 
                idx.name === 'status_1_recording.status_1_endTime_-1'
            );

            expect(recordingIndex).toBeDefined();
            expect(recordingIndex.key).toEqual({
                status: 1,
                'recording.status': 1,
                endTime: -1
            });
            expect(recordingIndex.background).toBe(true);
        });
    });

    describe('Query Performance', () => {
        it('should complete available recordings query in less than 50ms', async () => {
            const startTime = Date.now();
            
            const recordings = await LiveSession.find({
                status: 'ended',
                'recording.status': 'completed'
            })
            .sort({ endTime: -1 })
            .limit(50)
            .lean();
            
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(50);
            expect(recordings.length).toBe(50);
        });

        it('should use the compound index for the query', async () => {
            const explainResult = await LiveSession.find({
                status: 'ended',
                'recording.status': 'completed'
            })
            .sort({ endTime: -1 })
            .limit(50)
            .explain('executionStats');

            // Check that the query used an index (not COLLSCAN)
            const executionStage = explainResult.executionStats.executionStages;
            
            // The query should use IXSCAN (index scan) not COLLSCAN (collection scan)
            expect(executionStage.stage).not.toBe('COLLSCAN');
            
            // Verify an index was used (check for IXSCAN stage in the execution plan)
            const hasIndexScan = JSON.stringify(explainResult).includes('IXSCAN');
            expect(hasIndexScan).toBe(true);
        });

        it('should return only sessions with status=ended and recording.status=completed', async () => {
            const recordings = await LiveSession.find({
                status: 'ended',
                'recording.status': 'completed'
            })
            .sort({ endTime: -1 })
            .limit(50)
            .lean();

            recordings.forEach(recording => {
                expect(recording.status).toBe('ended');
                expect(recording.recording.status).toBe('completed');
                expect(recording.recording.playUrl).toBeDefined();
            });
        });

        it('should return results sorted by endTime descending', async () => {
            const recordings = await LiveSession.find({
                status: 'ended',
                'recording.status': 'completed'
            })
            .sort({ endTime: -1 })
            .limit(50)
            .lean();

            // Verify descending order
            for (let i = 1; i < recordings.length; i++) {
                const prevEndTime = new Date(recordings[i - 1].endTime).getTime();
                const currEndTime = new Date(recordings[i].endTime).getTime();
                expect(prevEndTime).toBeGreaterThanOrEqual(currEndTime);
            }
        });

        it('should respect the limit of 50 results', async () => {
            const recordings = await LiveSession.find({
                status: 'ended',
                'recording.status': 'completed'
            })
            .sort({ endTime: -1 })
            .limit(50)
            .lean();

            expect(recordings.length).toBeLessThanOrEqual(50);
        });
    });

    describe('Query Correctness', () => {
        it('should not return sessions with pending recordings', async () => {
            const recordings = await LiveSession.find({
                status: 'ended',
                'recording.status': 'completed'
            })
            .sort({ endTime: -1 })
            .limit(50)
            .lean();

            const pendingRecordings = recordings.filter(r => 
                r.recording.status === 'pending'
            );

            expect(pendingRecordings.length).toBe(0);
        });

        it('should not return scheduled sessions', async () => {
            const recordings = await LiveSession.find({
                status: 'ended',
                'recording.status': 'completed'
            })
            .sort({ endTime: -1 })
            .limit(50)
            .lean();

            const scheduledSessions = recordings.filter(r => 
                r.status === 'scheduled'
            );

            expect(scheduledSessions.length).toBe(0);
        });

        it('should not return live sessions', async () => {
            const recordings = await LiveSession.find({
                status: 'ended',
                'recording.status': 'completed'
            })
            .sort({ endTime: -1 })
            .limit(50)
            .lean();

            const liveSessions = recordings.filter(r => 
                r.status === 'live'
            );

            expect(liveSessions.length).toBe(0);
        });
    });

    describe('Performance with Large Dataset', () => {
        it('should maintain performance with 100+ total sessions', async () => {
            // We already have 100 sessions from beforeAll
            const totalSessions = await LiveSession.countDocuments({
                topic: /^Recording Index Test/
            });

            expect(totalSessions).toBeGreaterThanOrEqual(100);

            // Test query performance
            const startTime = Date.now();
            
            await LiveSession.find({
                status: 'ended',
                'recording.status': 'completed'
            })
            .sort({ endTime: -1 })
            .limit(50)
            .lean();
            
            const duration = Date.now() - startTime;

            // Should still be fast even with 100+ sessions
            expect(duration).toBeLessThan(50);
        });
    });
});
