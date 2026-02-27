const Support = require('../models/supportModel');
const sendEmail = require('../utils/sendEmail');
const emailTemplates = require('../utils/emailTemplates');
const socketService = require('../services/SocketService');

// @desc    Create a new support ticket
// @route   POST /api/support
// @access  Public
const createTicket = async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !subject || !message) {
            return res.status(400).json({ message: 'Please fill in all fields' });
        }

        const ticket = await Support.create({
            user: req.user ? req.user.id : null,
            name,
            email,
            subject,
            message,
        });

        // Real-time: Notify Admins of new ticket
        socketService.broadcast('admin_notification', {
            type: 'new_ticket',
            title: 'New Support Ticket',
            message: `Subject: ${subject} from ${name}`,
            ticketId: ticket._id
        });

        res.status(201).json(ticket);
    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ message: 'Server error creating ticket' });
    }
};

// @desc    Get all support tickets
// @route   GET /api/support
// @access  Private (Admin)
const getTickets = async (req, res) => {
    try {
        const tickets = await Support.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ message: 'Server error fetching tickets' });
    }
};

// @desc    Update ticket status
// @route   PUT /api/support/:id
// @access  Private (Admin)
const updateTicketStatus = async (req, res) => {
    try {
        const ticket = await Support.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        const oldResponse = ticket.adminResponse;
        ticket.status = req.body.status || ticket.status;
        ticket.adminResponse = req.body.adminResponse || ticket.adminResponse;

        const updatedTicket = await ticket.save();

        // Send email if a new response is added or updated
        if (req.body.adminResponse && req.body.adminResponse !== oldResponse) {
            try {
                await sendEmail({
                    email: ticket.email,
                    subject: `Update on your support request: ${ticket.subject}`,
                    message: `Hello ${ticket.name},\n\nan administrator has responded to your inquiry: ${req.body.adminResponse}`,
                    html: emailTemplates.supportResponse(ticket.name, ticket.subject, req.body.adminResponse, ticket.status)
                });
            } catch (emailError) {
                console.error('Email sending failed:', emailError);
                // We don't fail the request if email fails, but we log it
            }
        }

        // Real-time: Notify user of response
        if (ticket.user) {
            socketService.sendToUser(ticket.user, 'notification', {
                type: 'support_update',
                title: 'Support Update',
                message: `An administrator has responded to your ticket: ${ticket.subject}`,
                ticketId: ticket._id,
                status: ticket.status
            });
        }

        res.json(updatedTicket);
    } catch (error) {
        console.error('Update ticket error:', error);
        res.status(500).json({ message: 'Server error updating ticket' });
    }
};

module.exports = {
    createTicket,
    getTickets,
    updateTicketStatus,
};
