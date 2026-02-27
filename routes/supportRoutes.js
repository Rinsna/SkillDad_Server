const express = require('express');
const router = express.Router();
const { createTicket, getTickets, updateTicketStatus } = require('../controllers/supportController');
const { protect } = require('../middleware/authMiddleware');

const checkAdmin = (req, res, next) => {
    if (req.user && req.user.role?.toLowerCase() === 'admin') {
        next();
    } else {
        return res.status(403).json({ message: 'Not authorized as an Admin' });
    }
};

router.post('/', createTicket);
router.get('/', protect, checkAdmin, getTickets);
router.put('/:id', protect, checkAdmin, updateTicketStatus);

module.exports = router;
