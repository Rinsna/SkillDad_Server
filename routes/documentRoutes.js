const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../middleware/authMiddleware');
const Document = require('../models/documentModel');

// Configure multer for file uploads
// Configure multer for file uploads with robust path handling
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            // Use path.resolve to ensure we have an absolute path from the server root
            const serverRoot = path.resolve(__dirname, '..');
            const dest = path.join(serverRoot, 'uploads', 'documents');

            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
                console.log(`[Multer] Created destination directory: ${dest}`);
            }
            cb(null, dest);
        } catch (err) {
            console.error('[Multer] Destination error:', err.message);
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const exit = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${exit}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Robust check for both common extensions and mimetypes
    const allowedExts = /jpeg|jpg|png|pdf|doc|docx|zip|rar|txt/;
    const allowedMimeKeywords = /jpeg|jpg|png|pdf|word|office|zip|octet-stream|text/;

    const extName = allowedExts.test(path.extname(file.originalname).toLowerCase());
    const mimeType = allowedMimeKeywords.test(file.mimetype.toLowerCase()) || file.mimetype.startsWith('application/');

    if (extName) {
        // If extension is allowed, we're generally safe, but verify mimetype isn't something totally alien
        return cb(null, true);
    } else {
        console.warn(`[Multer] Rejecting file: ${file.originalname} (${file.mimetype})`);
        cb(new Error('File type not supported. Use PDF, DOC, DOCX, JPG, PNG, ZIP, RAR, or TXT.'));
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
        console.log(`[Document Upload] Hit by ${req.user.email} (${req.user.role})`);

        if (!req.file) {
            console.warn('[Document Upload] No file in request');
            return res.status(400).json({ message: 'No file uploaded or file filter rejected it' });
        }

        const { title, description, type, course, student, recipientUniversity } = req.body;
        console.log('[Document Upload] Body data:', { title, type, course, student });

        // Build the document object
        const docData = {
            title: title || req.file.originalname,
            description: description || 'No description provided',
            type: type || 'other',
            uploadedBy: req.user._id,
            fileName: req.file.originalname,
            fileUrl: `uploads/documents/${req.file.filename}`,
            fileSize: req.file.size,
            status: 'submitted'
        };

        // Handle optional and role-based fields
        if (course && course !== '' && course !== 'undefined') {
            docData.course = course;
        }

        if (student && student !== '' && student !== 'undefined') {
            docData.student = student;
        } else if (req.user.role === 'student') {
            docData.student = req.user._id;
        }

        if (recipientUniversity && recipientUniversity !== '' && recipientUniversity !== 'undefined') {
            docData.recipientUniversity = recipientUniversity;
        }

        // Set university field for university role uploads
        if (req.user.role === 'university') {
            docData.university = req.user._id;
        } else if (req.user.role === 'admin' && (recipientUniversity || course)) {
            // Admin can assign it to a university or keep it general
            if (recipientUniversity) docData.university = recipientUniversity;
        }

        // Set format safely based on model enum
        const rawExt = path.extname(req.file.originalname);
        let format = 'PDF'; // Default fallback
        if (rawExt) {
            const ext = rawExt.substring(1).toUpperCase();
            // Match the enum: ['PDF', 'DOC', 'DOCX', 'JPG', 'JPEG', 'PNG', 'ZIP', 'RAR', 'TXT']
            const modelEnum = ['PDF', 'DOC', 'DOCX', 'JPG', 'JPEG', 'PNG', 'ZIP', 'RAR', 'TXT'];
            if (modelEnum.includes(ext)) {
                format = ext;
            } else if (ext === 'JPG') {
                format = 'JPG';
            }
        }
        docData.format = format;

        const document = new Document(docData);
        const savedDocument = await document.save();
        console.log('[Document Upload] Saved successfully:', savedDocument._id);

        // Populate details for response if possible (non-blocking for UI success)
        try {
            if (savedDocument.student) await savedDocument.populate('student', 'name email');
            if (savedDocument.course) await savedDocument.populate('course', 'title');
        } catch (popError) {
            console.error('[Document Upload] Population failed (ignoring):', popError.message);
        }

        res.status(201).json(savedDocument);
    } catch (error) {
        console.error('[Document Upload] 500 CRITICAL Error:', error);
        res.status(500).json({
            message: 'Server failed to process document upload',
            error: error.message,
            stack: process.env.NODE_ENV === 'production' ? null : error.stack
        });
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