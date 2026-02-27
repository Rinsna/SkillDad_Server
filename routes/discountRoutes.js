const express = require('express');
const router = express.Router();
const { validateDiscount, createDiscount, getDiscounts } = require('../controllers/discountController');
const { protect, admin } = require('../middleware/authMiddleware');

router.post('/validate', protect, validateDiscount);
router.post('/', protect, admin, createDiscount);
router.get('/', protect, admin, getDiscounts);

module.exports = router;
