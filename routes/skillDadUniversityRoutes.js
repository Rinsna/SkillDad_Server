const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    getSkillDadUniversities,
    createSkillDadUniversity,
    updateSkillDadUniversity,
    deleteSkillDadUniversity,
} = require('../controllers/skillDadUniversityController');

// All routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

router.route('/')
    .get(getSkillDadUniversities)
    .post(createSkillDadUniversity);

router.route('/:id')
    .put(updateSkillDadUniversity)
    .delete(deleteSkillDadUniversity);

module.exports = router;
