const multer = require('multer');
const storageConfig = require('../config/fileStorage');

/**
 * Multer middleware configuration for exam file uploads
 * Uses memory storage to allow flexible handling by FileUploadService
 */

// Use memory storage for flexibility
const storage = multer.memoryStorage();

/**
 * File filter for question papers (PDF only)
 */
const questionPaperFilter = (req, file, cb) => {
  const allowedTypes = storageConfig.limits.questionPaper.allowedTypes;
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed for question papers'), false);
  }
};

/**
 * File filter for answer sheets (PDF and images)
 */
const answerSheetFilter = (req, file, cb) => {
  const allowedTypes = storageConfig.limits.answerSheet.allowedTypes;
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and image files (JPG, PNG) are allowed for answer sheets'), false);
  }
};

/**
 * Multer upload instance for question papers
 */
const uploadQuestionPaper = multer({
  storage,
  limits: {
    fileSize: storageConfig.limits.questionPaper.maxSize,
  },
  fileFilter: questionPaperFilter,
}).single('questionPaper');

/**
 * Multer upload instance for answer sheets
 */
const uploadAnswerSheet = multer({
  storage,
  limits: {
    fileSize: storageConfig.limits.answerSheet.maxSize,
  },
  fileFilter: answerSheetFilter,
}).single('answerSheet');

/**
 * Error handling middleware for multer errors
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds the allowed limit',
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next();
};

module.exports = {
  uploadQuestionPaper,
  uploadAnswerSheet,
  handleUploadError,
};
