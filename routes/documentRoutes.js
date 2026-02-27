const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, authorize } = require('../middleware/authMiddleware');
const Document = require('../models/documentModel');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/documents/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Invalid file type'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: fileFilter
});

// @desc    Get all documents for a student
// @route   GET /api/documents/my-documents
// @access  Private (Student)
router.get('/my-documents', protect, async (req, res) => {
    try {
        const documents = await Document.find({
            $or: [
                { student: req.user._id },
                { uploadedBy: req.user._id }
            ]
        }).populate('course', 'title')
            .populate('reviewedBy', 'name')
            .sort({ createdAt: -1 });

        res.json(documents);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get all documents (Admin/University view)
// @route   GET /api/documents
// @access  Private (Admin/University)
router.get('/', protect, authorize('admin', 'university'), async (req, res) => {
    try {
        const { status, type, student, recipientUniversity } = req.query;
        let filter = {};

        if (status) filter.status = status;
        if (type) filter.type = type;
        if (student) filter.student = student;
        if (recipientUniversity) filter.recipientUniversity = recipientUniversity;

        // Restriction for university role: Only see relevant documents
        if (req.user.role === 'university') {
            filter = {
                $and: [
                    filter,
                    {
                        $or: [
                            { recipientUniversity: req.user._id },
                            { uploadedBy: req.user._id },
                            { reviewedBy: req.user._id }
                        ]
                    }
                ]
            };
        }

        const documents = await Document.find(filter)
            .populate('student', 'name email')
            .populate('course', 'title')
            .populate('uploadedBy', 'name')
            .populate('reviewedBy', 'name')
            .populate('recipientUniversity', 'name')
            .sort({ createdAt: -1 });

        res.json(documents);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get document by ID
// @route   GET /api/documents/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const document = await Document.findById(req.params.id)
            .populate('student', 'name email')
            .populate('course', 'title')
            .populate('uploadedBy', 'name')
            .populate('reviewedBy', 'name');

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        // Check if user has access to this document
        if (req.user.role === 'student' &&
            document.student.toString() !== req.user._id.toString() &&
            document.uploadedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        res.json(document);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Upload document
// @route   POST /api/documents/upload
// @access  Private
router.post('/upload', protect, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { title, description, type, course, student, recipientUniversity } = req.body;

        const document = new Document({
            title,
            description,
            type,
            course: course || null,
            student: student || (req.user.role === 'student' ? req.user._id : null),
            recipientUniversity: recipientUniversity || null,
            uploadedBy: req.user._id,
            fileName: req.file.originalname,
            fileUrl: req.file.path,
            fileSize: req.file.size,
            format: path.extname(req.file.originalname).substring(1).toUpperCase(),
            status: 'submitted'
        });

        const savedDocument = await document.save();
        await savedDocument.populate('student', 'name email');
        await savedDocument.populate('course', 'title');

        res.status(201).json(savedDocument);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Review document (Approve/Reject)
// @route   PUT /api/documents/:id/review
// @access  Private (Admin/University)
router.put('/:id/review', protect, authorize('admin', 'university'), async (req, res) => {
    try {
        const { status, rejectionReason } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const document = await Document.findById(req.params.id);

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        document.status = status;
        document.reviewedBy = req.user._id;
        document.reviewedAt = new Date();

        if (status === 'rejected' && rejectionReason) {
            document.rejectionReason = rejectionReason;
        }

        const updatedDocument = await document.save();
        await updatedDocument.populate('student', 'name email');
        await updatedDocument.populate('reviewedBy', 'name');

        res.json(updatedDocument);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Create document requirement
// @route   POST /api/documents/requirements
// @access  Private (Admin/University)
router.post('/requirements', protect, authorize('admin', 'university'), async (req, res) => {
    try {
        const document = new Document({
            ...req.body,
            uploadedBy: req.user._id,
            status: 'pending'
        });

        const savedDocument = await document.save();
        res.status(201).json(savedDocument);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Update document
// @route   PUT /api/documents/:id
// @access  Private
router.put('/:id', protect, async (req, res) => {
    try {
        const document = await Document.findById(req.params.id);

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        // Check authorization
        if (req.user.role === 'student' &&
            document.uploadedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        Object.assign(document, req.body);
        const updatedDocument = await document.save();

        res.json(updatedDocument);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Delete document
// @route   DELETE /api/documents/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const document = await Document.findById(req.params.id);

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        // Check authorization
        if (req.user.role === 'student' &&
            document.uploadedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await document.deleteOne();
        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get document statistics
// @route   GET /api/documents/stats
// @access  Private (Admin/University)
router.get('/stats', protect, authorize('admin', 'university'), async (req, res) => {
    try {
        const stats = await Document.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const typeStats = await Document.aggregate([
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            statusStats: stats,
            typeStats: typeStats
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;