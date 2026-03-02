const express = require('express');
const router = express.Router();
const {
    createContent,
    updateContent,
    deleteContent,
    getModuleContent,
    reorderContent
} = require('../controllers/interactiveContentController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Routes for interactive content management
// All routes are scoped under /api/courses/:courseId/modules/:moduleId/content

// Create content - requires university or admin role
router.post(
    '/:courseId/modules/:moduleId/content',
    protect,
    authorize('university', 'admin'),
    createContent
);

// Get module content - public for enrolled students
router.get(
    '/:courseId/modules/:moduleId/content',
    getModuleContent
);

// Update content - requires university or admin role
router.put(
    '/:courseId/modules/:moduleId/content/:contentId',
    protect,
    authorize('university', 'admin'),
    updateContent
);

// Delete content - requires university or admin role
router.delete(
    '/:courseId/modules/:moduleId/content/:contentId',
    protect,
    authorize('university', 'admin'),
    deleteContent
);

// Reorder content - requires university or admin role
router.put(
    '/:courseId/modules/:moduleId/content/reorder',
    protect,
    authorize('university', 'admin'),
    reorderContent
);

module.exports = router;
