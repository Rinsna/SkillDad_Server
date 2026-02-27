const mongoose = require('mongoose');

const progressSchema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    completedVideos: [{ type: mongoose.Schema.Types.ObjectId }], // IDs of videos watched
    completedExercises: [{
        video: mongoose.Schema.Types.ObjectId,
        score: Number,
    }],
    projectSubmissions: [{
        project: mongoose.Schema.Types.ObjectId,
        fileUrl: String,
        grade: String,
        feedback: String,
    }],
    isCompleted: { type: Boolean, default: false },
}, {
    timestamps: true,
});

const Progress = mongoose.model('Progress', progressSchema);

module.exports = Progress;
