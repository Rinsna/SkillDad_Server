const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true },
    category: {
        type: String,
        required: true,
        enum: [
            'Getting Started',
            'Account & Login',
            'Course Enrollment',
            'Live Classes',
            'Payments',
            'Technical Issues',
            'Certificates & Graduation',
            'Refunds & Cancellations',
            'Mobile & Compatibility'
        ]
    },
    help_link: { type: String, default: '' },
    demo_video_link: { type: String, default: '' },
    views: { type: Number, default: 0 },
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 }
}, { timestamps: true });

faqSchema.index({ question: 'text', answer: 'text' });

module.exports = mongoose.models.FAQ || mongoose.model('FAQ', faqSchema);
