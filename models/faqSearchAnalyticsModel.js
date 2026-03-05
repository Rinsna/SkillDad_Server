const mongoose = require('mongoose');

const faqSearchAnalyticsSchema = new mongoose.Schema({
    query: { type: String, required: true, lowercase: true },
    count: { type: Number, default: 1 }
}, { timestamps: true });

module.exports = mongoose.models.FAQSearchAnalytics || mongoose.model('FAQSearchAnalytics', faqSearchAnalyticsSchema);
