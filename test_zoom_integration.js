/**
 * Test Script: Add Mock Zoom Recording to Course Video
 * This script adds mock Zoom recording data to a course video for testing
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const Course = require('./models/courseModel');

async function addMockZoomRecording() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Find the Python course
        const course = await Course.findOne({ title: /Python/i });
        
        if (!course) {
            console.log('❌ Python course not found');
            return;
        }

        console.log(`✅ Found course: ${course.title}`);
        console.log(`   Course ID: ${course._id}`);
        console.log(`   Modules: ${course.modules.length}`);

        // Get the first video
        if (course.modules.length > 0 && course.modules[0].videos.length > 0) {
            const video = course.modules[0].videos[0];
            
            console.log(`\n📹 Updating video: ${video.title}`);
            console.log(`   Current type: ${video.videoType || 'external'}`);
            console.log(`   Current URL: ${video.url}`);

            // Add mock Zoom recording data
            video.videoType = 'zoom-recording';
            video.zoomRecording = {
                recordingId: 'MOCK_REC_123456',
                playUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', // Sample video for testing
                downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                durationMs: 596000, // ~10 minutes
                fileSizeBytes: 158008374,
                recordedAt: new Date()
            };

            await course.save();

            console.log('\n✅ Successfully added mock Zoom recording!');
            console.log('\n📋 Test Instructions:');
            console.log('1. Refresh your browser');
            console.log('2. Navigate to the Python course');
            console.log('3. Click on "Python Introduction" video');
            console.log('4. You should now see a Zoom recording player instead of YouTube!');
            console.log('\n🔗 Direct URL:');
            console.log(`   http://127.0.0.1:5174/dashboard/course/${course._id}`);
            
        } else {
            console.log('❌ No videos found in course');
        }

        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Run the script
addMockZoomRecording();
