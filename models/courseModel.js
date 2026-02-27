const mongoose = require('mongoose');

const exerciseSchema = mongoose.Schema({
    question: { type: String, required: true },
    options: [{ type: String }],
    correctAnswer: { type: String, required: true },
    type: { type: String, enum: ['mcq', 'short-answer'], default: 'mcq' },
});

const videoSchema = mongoose.Schema({
    title: { type: String, required: true },
    url: { type: String, required: true }, // Embed URL (YouTube/Vimeo) or Zoom recording URL
    duration: { type: String }, // e.g., "10:05"
    exercises: [exerciseSchema], // Mandatory exercises after video

    // Zoom recording integration
    videoType: {
        type: String,
        enum: ['external', 'zoom-recording', 'zoom-live'],
        default: 'external'
    },
    zoomRecording: {
        recordingId: String,
        playUrl: String,
        downloadUrl: String,
        durationMs: Number,
        fileSizeBytes: Number,
        recordedAt: Date,
    },
    zoomSession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LiveSession'
    }
});

// Video type consistency validation
videoSchema.pre('validate', function () {
    // Requirement 8.1: If videoType='zoom-recording', zoomRecording.playUrl must exist
    if (this.videoType === 'zoom-recording') {
        if (!this.zoomRecording || !this.zoomRecording.playUrl) {
            throw new Error('zoomRecording.playUrl is required when videoType is "zoom-recording"');
        }
        // Requirement 8.2: If videoType='zoom-recording', zoomSession reference must exist
        if (!this.zoomSession) {
            throw new Error('zoomSession reference is required when videoType is "zoom-recording"');
        }
    }

    // Requirement 8.3: If videoType='external', zoomRecording should be null/undefined
    if (this.videoType === 'external') {
        if (this.zoomRecording && (this.zoomRecording.playUrl || this.zoomRecording.recordingId)) {
            throw new Error('zoomRecording must be null when videoType is "external"');
        }
        // Requirement 8.4: If videoType='external', zoomSession should be null/undefined
        if (this.zoomSession) {
            throw new Error('zoomSession must be null when videoType is "external"');
        }
    }

    // Requirement 8.5: url field must not be null or empty
    if (!this.url || this.url.trim() === '') {
        throw new Error('url field must not be null or empty');
    }
});

const moduleSchema = mongoose.Schema({
    title: { type: String, required: true },
    videos: [videoSchema],
});

const courseSchema = mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    thumbnail: { type: String }, // URL
    category: { type: String, required: true },
    price: { type: Number, required: true, default: 0 },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    instructorName: { type: String }, // Manual override
    universityName: { type: String }, // Manual override
    modules: [moduleSchema],
    projects: [{
        title: String,
        description: String,
        deadline: Date,
    }],
    isPublished: { type: Boolean, default: false },
}, {
    timestamps: true,
});

const Course = mongoose.model('Course', courseSchema);

module.exports = Course;
