const FAQ = require('../models/faqModel');
const FAQSearchAnalytics = require('../models/faqSearchAnalyticsModel');

// @desc    Get all FAQs (public, with optional search)
// @route   GET /api/faqs
// @access  Public
const getFAQs = async (req, res) => {
    try {
        const { search, category } = req.query;
        let query = {};

        if (search) {
            query.$text = { $search: search };
            // Track search analytics using $inc and upsert for maximum performance
            await FAQSearchAnalytics.findOneAndUpdate(
                { query: search.toLowerCase() },
                { $inc: { count: 1 } },
                { upsert: true, new: true }
            );
        }

        if (category) {
            query.category = category;
        }

        let faqs;
        if (search) {
            // Sort by text score if searching
            faqs = await FAQ.find(query, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } });
        } else {
            faqs = await FAQ.find(query).sort({ views: -1, createdAt: -1 });
        }

        res.status(200).json(faqs);
    } catch (error) {
        res.status(500).json({ message: 'Server Error fetching FAQs' });
    }
};

// @desc    Get FAQ by ID
// @route   GET /api/faqs/:id
// @access  Public
const getFAQById = async (req, res) => {
    try {
        const faq = await FAQ.findById(req.params.id);
        if (!faq) {
            return res.status(404).json({ message: 'FAQ not found' });
        }
        res.status(200).json(faq);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create new FAQ
// @route   POST /api/faqs
// @access  Private/Admin
const createFAQ = async (req, res) => {
    try {
        const faq = await FAQ.create(req.body);
        res.status(201).json(faq);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Update FAQ
// @route   PUT /api/faqs/:id
// @access  Private/Admin
const updateFAQ = async (req, res) => {
    try {
        const faq = await FAQ.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!faq) return res.status(404).json({ message: 'FAQ not found' });
        res.status(200).json(faq);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete FAQ
// @route   DELETE /api/faqs/:id
// @access  Private/Admin
const deleteFAQ = async (req, res) => {
    try {
        const faq = await FAQ.findByIdAndDelete(req.params.id);
        if (!faq) return res.status(404).json({ message: 'FAQ not found' });
        res.status(200).json({ message: 'FAQ deleted' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Submit Feedback (helpful/not helpful)
// @route   POST /api/faqs/:id/feedback
// @access  Public
const submitFeedback = async (req, res) => {
    try {
        const { isHelpful } = req.body;
        const update = isHelpful ? { $inc: { upvotes: 1 } } : { $inc: { downvotes: 1 } };

        const faq = await FAQ.findByIdAndUpdate(req.params.id, update, { new: true });

        if (!faq) return res.status(404).json({ message: 'FAQ not found' });
        res.status(200).json(faq);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get Analytics
// @route   GET /api/faqs/analytics/stats
// @access  Private/Admin
const getAnalytics = async (req, res) => {
    try {
        const mostViewed = await FAQ.find().sort({ views: -1 }).limit(10);

        const topSearches = await FAQSearchAnalytics.aggregate([
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $project: { _id: "$query", count: 1 } }
        ]);

        res.status(200).json({ mostViewed, topSearches });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Increment Views
// @route   POST /api/faqs/:id/view
// @access  Public
const incrementView = async (req, res) => {
    try {
        const faq = await FAQ.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } },
            { new: true }
        );

        if (!faq) return res.status(404).json({ message: 'FAQ not found' });
        res.status(200).json(faq);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Clear Search Analytics
// @route   DELETE /api/faqs/analytics/clear
// @access  Private/Admin
const clearAnalytics = async (req, res) => {
    try {
        await FAQSearchAnalytics.deleteMany({});
        res.status(200).json({ message: 'Search analytics cleared' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getFAQs,
    getFAQById,
    createFAQ,
    updateFAQ,
    deleteFAQ,
    submitFeedback,
    getAnalytics,
    incrementView,
    clearAnalytics
};
